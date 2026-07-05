// 模型调用网关
// 封装 OpenAI-compatible 模型调用
// 对应文档：06_工程实施补齐/09_模型调用网关设计_v1.0.md
// 对应任务：DEV-067
//
// 职责：
// - 请求构造（OpenAI chat/completions 格式）
// - API Key 解密
// - 超时控制（默认 120s）
// - 取消控制（AbortSignal）
// - 错误转换（HTTP 状态码 → AppError）
// - 日志脱敏（不记录 api_key、完整 messages）
//
// 架构约束：
// - 只有 ModelService 可以使用此模块
// - UI / 其他 Service 禁止直接使用

import type { AppError } from '@/types/error'
import type { ModelMessage, ModelResult, ModelInfo, ToolDefinition, ToolChoice, ToolCall } from '@/types'
import { decryptSecret } from '@/services/secret/secretGateway'
import {
  MODEL_AUTH_FAILED,
  MODEL_ENDPOINT_FAILED,
  MODEL_NOT_FOUND,
  MODEL_CONTEXT_TOO_LONG,
  MODEL_TIMEOUT,
  MODEL_RATE_LIMITED,
} from '@/constants/errors'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

/// 选择合适的 fetch：Tauri 环境使用插件 fetch 绕过 CORS，浏览器环境使用原生 fetch
const safeFetch: typeof globalThis.fetch =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? (tauriFetch as unknown as typeof globalThis.fetch)
    : globalThis.fetch

// ============ 类型定义 ============

export type ModelGatewayInput = {
  baseUrl: string
  /// 已加密的 API Key（Base64）
  apiKeyEncrypted: string | null
  modelName: string
  messages: ModelMessage[]
  temperature?: number
  maxOutputTokens?: number
  /// 可用工具列表（OpenAI function calling）；为空或不传时不启用 Tool Use
  tools?: ToolDefinition[]
  /// 工具选择策略；仅当 tools 非空时生效，默认 'auto'
  toolChoice?: ToolChoice
  /// 请求超时（毫秒），默认 120000
  timeoutMs?: number
  /// 外部取消信号
  signal?: AbortSignal
}

// ============ 内部工具 ============

/// OpenAI chat/completions 响应结构（仅取需要的字段）
interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string
      /// 模型请求的工具调用（function calling）
      tool_calls?: ToolCall[]
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  model?: string
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

/// 将 HTTP 状态码与错误体映射为 AppError
function mapHttpError(
  status: number,
  body: OpenAIChatResponse | unknown,
): AppError {
  const errorBody =
    typeof body === 'object' && body !== null
      ? (body as OpenAIChatResponse).error
      : undefined
  const message = errorBody?.message ?? `HTTP ${status}`

  if (status === 401 || status === 403) {
    return {
      code: MODEL_AUTH_FAILED,
      message: 'API 密钥无效',
      retryable: false,
      detail: message,
    }
  }
  if (status === 404) {
    return {
      code: MODEL_NOT_FOUND,
      message: '找不到指定模型',
      retryable: false,
      detail: message,
    }
  }
  if (status === 429) {
    return {
      code: MODEL_RATE_LIMITED,
      message: '请求过于频繁，请稍后重试',
      retryable: true,
      detail: message,
    }
  }
  if (status === 400 || status === 413) {
    // 上下文过长通常返回 400 + context_length_exceeded，或 413
    const lowerMsg = message.toLowerCase()
    if (
      lowerMsg.includes('context') ||
      lowerMsg.includes('token') ||
      lowerMsg.includes('length')
    ) {
      return {
        code: MODEL_CONTEXT_TOO_LONG,
        message: '本次参考内容过长',
        retryable: true,
        detail: message,
      }
    }
    return {
      code: 'MODEL_ENDPOINT_FAILED',
      message: `模型服务地址不可用（HTTP ${status}：${message}）`,
      retryable: false,
      detail: message,
    }
  }
  if (status >= 500) {
    return {
      code: MODEL_ENDPOINT_FAILED,
      message: `模型服务地址不可用（HTTP ${status}：${message}）`,
      retryable: true,
      detail: message,
    }
  }
  return {
    code: 'MODEL_ENDPOINT_FAILED',
    message: `模型服务地址不可用（HTTP ${status}：${message}）`,
    retryable: true,
    detail: message,
  }
}

/// 规范化 base_url，确保以 /v1/chat/completions 结尾
function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(trimmed)) return trimmed
  if (/\/v1$/.test(trimmed)) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

/// 构造 models 列表端点 URL
function buildModelsEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (/\/models$/.test(trimmed)) return trimmed
  if (/\/v1$/.test(trimmed)) return `${trimmed}/models`
  return `${trimmed}/v1/models`
}

/// 将内部 ModelMessage 转换为 OpenAI API 要求的 snake_case 格式
///
/// 关键字段映射：
/// - toolCalls → tool_calls
/// - toolCallId → tool_call_id
function toOpenAIMessages(messages: ModelMessage[]): unknown[] {
  return messages.map((msg) => {
    const base = {
      role: msg.role,
      content: msg.content,
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        ...base,
        tool_calls: msg.toolCalls,
      }
    }
    if (msg.toolCallId) {
      return {
        ...base,
        tool_call_id: msg.toolCallId,
      }
    }
    return base
  })
}

/// 合并外部 signal 与超时 signal
function mergeSignals(
  external?: AbortSignal,
  timeoutMs = 120000,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let onExternalAbort: (() => void) | null = null

  if (external) {
    if (external.aborted) {
      controller.abort()
    } else {
      onExternalAbort = () => controller.abort()
      external.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      if (onExternalAbort && external) {
        external.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}

// ============ 网关方法 ============

/// 调用 OpenAI-compatible 模型
///
/// 注意：此方法不重试。重试策略由 ModelService 决定。
export async function callOpenAICompatible(
  input: ModelGatewayInput,
): Promise<ModelResult> {
  // 1. 解密 API Key
  let apiKey = ''
  if (input.apiKeyEncrypted) {
    try {
      apiKey = await decryptSecret(input.apiKeyEncrypted)
    } catch {
      throw {
        code: MODEL_AUTH_FAILED,
        message: 'API 密钥解密失败',
        retryable: false,
      } as AppError
    }
  }

  // 2. 构造请求
  const endpoint = buildEndpoint(input.baseUrl)
  const { signal, cleanup } = mergeSignals(input.signal, input.timeoutMs)

  let response: Response
  try {
    response = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.modelName,
        messages: toOpenAIMessages(input.messages),
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxOutputTokens ?? 4096,
        stream: false,
        ...(input.tools && input.tools.length > 0
          ? {
              tools: input.tools,
              tool_choice: input.toolChoice ?? 'auto',
            }
          : {}),
      }),
      signal,
    })
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      // 区分超时取消与用户取消
      const isTimeout =
        input.signal === undefined || !input.signal.aborted
      throw {
        code: MODEL_TIMEOUT,
        message: isTimeout ? '模型响应超时' : '操作已取消',
        retryable: isTimeout,
      } as AppError
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw {
      code: MODEL_ENDPOINT_FAILED,
      message: `模型服务地址不可用（${detail}）`,
      retryable: true,
      detail,
    } as AppError
  }

  cleanup()

  // 3. 解析响应
  let body: OpenAIChatResponse
  try {
    body = (await response.json()) as OpenAIChatResponse
  } catch {
    throw {
      code: MODEL_ENDPOINT_FAILED,
      message: `模型服务地址不可用（响应解析失败，HTTP ${response.status}）`,
      retryable: true,
      detail: `响应解析失败 (HTTP ${response.status})`,
    } as AppError
  }

  if (!response.ok) {
    throw mapHttpError(response.status, body)
  }

  const choice = body.choices?.[0]
  const content = choice?.message?.content ?? ''
  const toolCalls = choice?.message?.tool_calls
  // 空内容且无工具调用时视为异常（保持原行为）
  if (!content && (!toolCalls || toolCalls.length === 0)) {
    // 检查是否因 max_tokens 截断导致空内容
    const finishReason = choice?.finish_reason ?? 'unknown'
    throw {
      code: 'MODEL_ENDPOINT_FAILED',
      message:
        finishReason === 'length'
          ? '模型返回被截断（max_tokens 过小）'
          : '模型返回空内容',
      retryable: true,
      detail: `finish_reason=${finishReason}, model=${body.model ?? input.modelName}`,
    } as AppError
  }

  return {
    content,
    toolCalls,
    modelName: body.model ?? input.modelName,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    finishReason: choice?.finish_reason,
    raw: body,
  }
}

/// 轻量连接测试：发送一个极简请求验证密钥与端点
export async function testConnection(input: {
  baseUrl: string
  apiKeyEncrypted: string | null
  modelName: string
  timeoutMs?: number
}): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await callOpenAICompatible({
      baseUrl: input.baseUrl,
      apiKeyEncrypted: input.apiKeyEncrypted,
      modelName: input.modelName,
      messages: [{ role: 'user', content: '请回复"你好"两个字' }],
      temperature: 0,
      maxOutputTokens: 64,
      timeoutMs: input.timeoutMs ?? 30000,
    })
    return {
      ok: true,
      message: `连接成功（模型：${result.modelName}，回复：${result.content.slice(0, 20)}）`,
    }
  } catch (error) {
    const appError = error as AppError
    return {
      ok: false,
      message: appError.message ?? '连接失败',
    }
  }
}

/// 内置常见模型能力 fallback 表
/// 当 /v1/models 端点不返回 context_length 时，从此表查找
const MODEL_CAPABILITY_FALLBACK: Record<string, {
  contextLength: number
  maxOutputTokens?: number
}> = {
  // DeepSeek
  'deepseek-chat': { contextLength: 65536, maxOutputTokens: 8192 },
  'deepseek-reasoner': { contextLength: 65536, maxOutputTokens: 8192 },
  // OpenAI GPT-4o 系列
  'gpt-4o': { contextLength: 128000, maxOutputTokens: 16384 },
  'gpt-4o-mini': { contextLength: 128000, maxOutputTokens: 16384 },
  'gpt-4-turbo': { contextLength: 128000, maxOutputTokens: 4096 },
  'gpt-4': { contextLength: 8192, maxOutputTokens: 4096 },
  // OpenAI GPT-3.5
  'gpt-3.5-turbo': { contextLength: 16385, maxOutputTokens: 4096 },
  'gpt-3.5-turbo-16k': { contextLength: 16385, maxOutputTokens: 4096 },
  // Claude 3.5
  'claude-3-5-sonnet-20240620': { contextLength: 200000, maxOutputTokens: 8192 },
  'claude-3-5-haiku-20241022': { contextLength: 200000, maxOutputTokens: 8192 },
  // 通义千问
  'qwen-max': { contextLength: 32768, maxOutputTokens: 8192 },
  'qwen-plus': { contextLength: 131072, maxOutputTokens: 8192 },
  'qwen-turbo': { contextLength: 1000000, maxOutputTokens: 8192 },
}

/// 从模型 ID 查找内置能力信息
export function lookupModelCapability(modelId: string): {
  contextLength: number | null
  maxOutputTokens: number | null
} {
  const lower = modelId.toLowerCase()
  // 精确匹配
  if (MODEL_CAPABILITY_FALLBACK[lower]) {
    const cap = MODEL_CAPABILITY_FALLBACK[lower]!
    return {
      contextLength: cap.contextLength,
      maxOutputTokens: cap.maxOutputTokens ?? null,
    }
  }
  // 前缀匹配（处理带日期后缀的模型名，如 gpt-4o-2024-08-06）
  for (const key of Object.keys(MODEL_CAPABILITY_FALLBACK)) {
    if (lower.startsWith(key)) {
      const cap = MODEL_CAPABILITY_FALLBACK[key]!
      return {
        contextLength: cap.contextLength,
        maxOutputTokens: cap.maxOutputTokens ?? null,
      }
    }
  }
  return { contextLength: null, maxOutputTokens: null }
}

/// 获取服务商可用模型列表
///
/// 调用 OpenAI-compatible /v1/models 端点，返回模型能力信息
export async function listModels(input: {
  baseUrl: string
  apiKeyEncrypted: string | null
  timeoutMs?: number
}): Promise<ModelInfo[]> {
  const apiKey = input.apiKeyEncrypted
    ? await decryptSecret(input.apiKeyEncrypted)
    : ''
  const endpoint = buildModelsEndpoint(input.baseUrl)
  const { signal, cleanup } = mergeSignals(undefined, input.timeoutMs ?? 15000)

  try {
    const response = await safeFetch(endpoint, {
      method: 'GET',
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw mapHttpError(response.status, body)
    }

    // 兼容不同服务商的响应字段名
    const body = (await response.json()) as {
      data?: Array<{
        id: string
        context_length?: number
        context_window?: number
        max_output_tokens?: number
        max_tokens?: number
      }>
    }

    const models: ModelInfo[] = (body.data ?? [])
      .filter((m) => !!m.id)
      .map((m) => {
        // 优先使用 API 返回的能力信息，其次查 fallback 表
        const apiContextLength =
          m.context_length ?? m.context_window ?? null
        const apiMaxOutput =
          m.max_output_tokens ?? m.max_tokens ?? null

        if (apiContextLength !== null) {
          return {
            id: m.id,
            contextLength: apiContextLength,
            maxOutputTokens: apiMaxOutput,
          }
        }

        // 查 fallback 表
        const fallback = lookupModelCapability(m.id)
        return {
          id: m.id,
          contextLength: fallback.contextLength,
          maxOutputTokens: fallback.maxOutputTokens,
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id))

    return models
  } finally {
    cleanup()
  }
}
