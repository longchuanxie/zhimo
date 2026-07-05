// 模型 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §11
// 对应任务：DEV-063 / DEV-064 / DEV-065 / DEV-066 / DEV-067
//
// 职责：
// - 服务商管理（列表/新增/编辑/删除）
// - API Key 加密存储与掩码生成
// - 连接测试
// - 任务模型配置（每个任务类型绑定一个 provider + model）
// - 模型调用（统一入口，含重试策略）
//
// 安全约束：
// - API Key 本地加密存储
// - UI 只显示掩码
// - 不写入日志
// - 不进入 Agent 上下文
// - 不进入导出文件
// - 不进入错误提示详情

import type {
  ModelProvider,
  ModelConfig,
  ModelTaskType,
  ModelMessage,
  ModelResult,
  ModelInfo,
  ConnectionStatus,
  ToolDefinition,
  ToolChoice,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import type { AppError } from '@/types/error'
import { VALIDATION_ERROR, NOT_FOUND, MODEL_NOT_CONFIGURED, MODEL_CONTEXT_TOO_LONG } from '@/constants/errors'
import {
  listProviders as repoListProviders,
  findProviderById,
  insertProvider,
  updateProvider as repoUpdateProvider,
  updateProviderApiKey,
  updateProviderConnectionStatus,
  deleteProvider as repoDeleteProvider,
  listConfigs as repoListConfigs,
  findConfigByTask,
  findConfigById,
  insertConfig,
  updateConfig as repoUpdateConfig,
  deleteConfig as repoDeleteConfig,
} from '@/services/database/modelRepository'
import {
  callOpenAICompatible,
  testConnection,
  listModels,
  lookupModelCapability,
} from '@/services/model/modelGateway'
import {
  encryptSecret,
  maskApiKey,
} from '@/services/secret/secretGateway'
import { findDefaultWorkspace } from '@/services/database/userWorkspaceRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateProviderInput = {
  name: string
  type: 'openai_compatible'
  baseUrl: string
  apiKey: string
  defaultModelName: string
  /// 默认模型的上下文窗口大小（tokens）
  defaultModelContextLength: number | null
}

export type UpdateProviderInput = {
  providerId: string
  patch: Partial<{
    name: string
    baseUrl: string
    defaultModelName: string
    defaultModelContextLength: number | null
    enabled: boolean
  }>
  /// 若提供则更新 API Key，否则保持原值
  apiKey?: string
}

export type UpsertConfigInput = {
  taskType: ModelTaskType
  providerId: string
  modelName: string
  temperature?: number
  maxOutputTokens?: number
}

export type CallModelInput = {
  modelConfigId: string
  messages: ModelMessage[]
  temperature?: number
  maxOutputTokens?: number
  /// 可用工具列表（OpenAI function calling）；为空时不启用 Tool Use
  tools?: ToolDefinition[]
  /// 工具选择策略；仅当 tools 非空时生效
  toolChoice?: ToolChoice
  timeoutMs?: number
  signal?: AbortSignal
}

// ============ 内部工具 ============

/// 获取默认工作空间 ID
async function getDefaultWorkspaceId(): Promise<ServiceResult<string>> {
  const workspace = await findDefaultWorkspace()
  if (!workspace) {
    return err({
      code: NOT_FOUND,
      message: '默认工作空间不存在',
      retryable: false,
    })
  }
  return ok(workspace.id)
}

// ============ Provider ============

/// 查询服务商列表
export async function listProviders(): Promise<ServiceResult<ModelProvider[]>> {
  try {
    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)
    const providers = await repoListProviders(wsResult.data)
    return ok(providers)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询服务商详情
export async function getProvider(
  providerId: string,
): Promise<ServiceResult<ModelProvider>> {
  try {
    const provider = await findProviderById(providerId)
    if (!provider) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }
    return ok(provider)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新增服务商
export async function createProvider(
  input: CreateProviderInput,
): Promise<ServiceResult<ModelProvider>> {
  try {
    if (!input.name.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '服务商名称不能为空',
        retryable: false,
      })
    }
    if (!input.baseUrl.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: 'Base URL 不能为空',
        retryable: false,
      })
    }
    if (!input.defaultModelName.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '默认模型名称不能为空',
        retryable: false,
      })
    }

    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)

    const providerId = generateId()
    const apiKeyEncrypted = input.apiKey
      ? await encryptSecret(input.apiKey)
      : null
    const apiKeyMasked = input.apiKey ? maskApiKey(input.apiKey) : null

    await insertProvider({
      id: providerId,
      workspaceId: wsResult.data,
      name: input.name.trim(),
      type: input.type,
      baseUrl: input.baseUrl.trim(),
      apiKeyEncrypted,
      apiKeyMasked,
      defaultModelName: input.defaultModelName.trim(),
      defaultModelContextLength: input.defaultModelContextLength,
    })

    const provider = await findProviderById(providerId)
    if (!provider) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '服务商创建后查询失败',
        retryable: true,
      })
    }
    return ok(provider)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 编辑服务商
export async function updateProvider(
  input: UpdateProviderInput,
): Promise<ServiceResult<ModelProvider>> {
  try {
    const existing = await findProviderById(input.providerId)
    if (!existing) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }

    if (input.patch.name !== undefined && !input.patch.name.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '服务商名称不能为空',
        retryable: false,
      })
    }

    await repoUpdateProvider(input.providerId, input.patch)

    if (input.apiKey !== undefined) {
      if (input.apiKey === '') {
        await updateProviderApiKey(input.providerId, null, null)
      } else {
        const encrypted = await encryptSecret(input.apiKey)
        const masked = maskApiKey(input.apiKey)
        await updateProviderApiKey(input.providerId, encrypted, masked)
      }
    }

    const updated = await findProviderById(input.providerId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除服务商
/// 副作用：关联的任务模型配置会被删除（数据库外键约束）
export async function deleteProvider(
  providerId: string,
): Promise<ServiceResult<void>> {
  try {
    const existing = await findProviderById(providerId)
    if (!existing) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }
    await repoDeleteProvider(providerId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 测试服务商连接
/// 副作用：更新 connection_status
export async function testProvider(
  providerId: string,
): Promise<ServiceResult<{ status: ConnectionStatus; message: string }>> {
  try {
    const provider = await findProviderById(providerId)
    if (!provider) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }

    const result = await testConnection({
      baseUrl: provider.baseUrl,
      apiKeyEncrypted: provider.apiKeyEncrypted,
      modelName: provider.defaultModelName,
    })

    const status: ConnectionStatus = result.ok ? 'connected' : 'failed'
    await updateProviderConnectionStatus(providerId, status)

    return ok({ status, message: result.message })
  } catch (error) {
    await updateProviderConnectionStatus(providerId, 'failed').catch(() => {})
    return err(fromUnknown(error))
  }
}

// ============ Config ============

/// 查询任务模型配置列表
export async function listConfigs(): Promise<ServiceResult<ModelConfig[]>> {
  try {
    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)
    const configs = await repoListConfigs(wsResult.data)
    return ok(configs)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询指定任务的模型配置
export async function getConfigByTask(
  taskType: ModelTaskType,
): Promise<ServiceResult<ModelConfig | null>> {
  try {
    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)
    const config = await findConfigByTask(wsResult.data, taskType)
    return ok(config)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 解析模型实际 maxOutputTokens（用于 upsertConfig 自动填充）
/// 优先查远程 /v1/models，失败回退内置 fallback 表，仍查不到回退 4096
/// 远程查询失败不抛错，保证离线可用
async function resolveMaxOutputTokens(
  provider: ModelProvider,
  modelName: string,
): Promise<number> {
  // 1. 尝试远程查询
  try {
    const models = await listModels({
      baseUrl: provider.baseUrl,
      apiKeyEncrypted: provider.apiKeyEncrypted,
    })
    const found = models.find((m) => m.id === modelName)
    if (found?.maxOutputTokens && found.maxOutputTokens > 0) {
      return found.maxOutputTokens
    }
  } catch {
    // 远程失败静默回退（保证离线可用）
  }
  // 2. 回退内置 fallback 表
  const fallback = lookupModelCapability(modelName)
  if (fallback.maxOutputTokens && fallback.maxOutputTokens > 0) {
    return fallback.maxOutputTokens
  }
  // 3. 最终回退
  return 4096
}

/// 新增或更新任务模型配置
/// 同一任务类型只能有一个配置（数据库唯一索引）
export async function upsertConfig(
  input: UpsertConfigInput,
): Promise<ServiceResult<ModelConfig>> {
  try {
    if (!input.modelName.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '模型名称不能为空',
        retryable: false,
      })
    }

    const provider = await findProviderById(input.providerId)
    if (!provider) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }

    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)

    const existing = await findConfigByTask(wsResult.data, input.taskType)
    const temperature = input.temperature ?? 0.7
    // 用户未指定 maxOutputTokens 时，自动查询模型实际能力
    const maxOutputTokens = input.maxOutputTokens ?? await resolveMaxOutputTokens(provider, input.modelName.trim())

    if (existing) {
      await repoUpdateConfig(existing.id, {
        providerId: input.providerId,
        modelName: input.modelName.trim(),
        temperature,
        maxOutputTokens,
        enabled: true,
      })
      const updated = await findConfigByTask(wsResult.data, input.taskType)
      if (!updated) {
        return err({
          code: NOT_FOUND,
          message: '任务模型配置不存在',
          retryable: false,
        })
      }
      return ok(updated)
    }

    const configId = generateId()
    await insertConfig({
      id: configId,
      workspaceId: wsResult.data,
      providerId: input.providerId,
      taskType: input.taskType,
      modelName: input.modelName.trim(),
      temperature,
      maxOutputTokens,
    })

    const created = await findConfigByTask(wsResult.data, input.taskType)
    if (!created) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '任务模型配置创建后查询失败',
        retryable: true,
      })
    }
    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除任务模型配置
export async function deleteConfig(
  configId: string,
): Promise<ServiceResult<void>> {
  try {
    await repoDeleteConfig(configId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 模型调用 ============

/// 调用模型（统一入口）
///
/// 重试策略：仅对可重试错误重试，最多 2 次，间隔 1s
export async function callModel(
  input: CallModelInput,
): Promise<ServiceResult<ModelResult>> {
  try {
    const config = await findConfigById(input.modelConfigId)
    if (!config) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '请先配置模型服务商',
        retryable: false,
      })
    }

    const provider = await findProviderById(config.providerId)
    if (!provider) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '请先配置模型服务商',
        retryable: false,
      })
    }

    if (!provider.enabled) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '模型服务商已禁用',
        retryable: false,
      })
    }

    const maxRetries = 2
    let lastError: AppError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await callOpenAICompatible({
          baseUrl: provider.baseUrl,
          apiKeyEncrypted: provider.apiKeyEncrypted,
          modelName: config.modelName,
          messages: input.messages,
          temperature: input.temperature ?? config.temperature,
          maxOutputTokens: input.maxOutputTokens ?? config.maxOutputTokens,
          tools: input.tools,
          toolChoice: input.toolChoice,
          timeoutMs: input.timeoutMs,
          signal: input.signal,
        })
        return ok(result)
      } catch (error) {
        lastError = error as AppError
        // 不可重试错误直接返回
        // MODEL_CONTEXT_TOO_LONG 虽标记为可重试，但不在此处盲目重试（相同上下文重试无意义），
        // 交由 AgentService.sendMessage 捕获后压缩上下文再重试
        if (lastError && (!lastError.retryable || lastError.code === MODEL_CONTEXT_TOO_LONG)) {
          return err(lastError)
        }
        // 最后一次尝试不再等待
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    return err(lastError ?? {
      code: 'UNKNOWN_ERROR',
      message: '出现未知错误',
      retryable: true,
    })
  } catch (error) {
    console.error('[ModelService.callModel] 未捕获异常:', error)
    return err(fromUnknown(error))
  }
}

/// 直接通过 provider + modelName 调用模型（不需要任务模型配置）
///
/// 用于未配置任务模型配置时的回退调用
export async function callModelDirect(input: {
  provider: ModelProvider
  modelName: string
  messages: ModelMessage[]
  temperature?: number
  maxOutputTokens?: number
  /// 可用工具列表（OpenAI function calling）；为空时不启用 Tool Use
  tools?: ToolDefinition[]
  /// 工具选择策略；仅当 tools 非空时生效
  toolChoice?: ToolChoice
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<ServiceResult<ModelResult>> {
  try {
    if (!input.provider.enabled) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '模型服务商已禁用',
        retryable: false,
      })
    }

    const maxRetries = 2
    let lastError: AppError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await callOpenAICompatible({
          baseUrl: input.provider.baseUrl,
          apiKeyEncrypted: input.provider.apiKeyEncrypted,
          modelName: input.modelName,
          messages: input.messages,
          temperature: input.temperature ?? 0.7,
          maxOutputTokens: input.maxOutputTokens ?? 4096,
          tools: input.tools,
          toolChoice: input.toolChoice,
          timeoutMs: input.timeoutMs,
          signal: input.signal,
        })
        return ok(result)
      } catch (error) {
        lastError = error as AppError
        if (lastError && (!lastError.retryable || lastError.code === MODEL_CONTEXT_TOO_LONG)) {
          return err(lastError)
        }
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    return err(lastError ?? {
      code: 'UNKNOWN_ERROR',
      message: '出现未知错误',
      retryable: true,
    })
  } catch (error) {
    console.error('[ModelService.callModelDirect] 未捕获异常:', error)
    return err(fromUnknown(error))
  }
}

/// 获取服务商可用模型列表（含模型能力信息）
export async function listProviderModels(
  providerId: string,
): Promise<ServiceResult<ModelInfo[]>> {
  try {
    const provider = await findProviderById(providerId)
    if (!provider) {
      return err({
        code: NOT_FOUND,
        message: '模型服务商不存在',
        retryable: false,
      })
    }
    const models = await listModels({
      baseUrl: provider.baseUrl,
      apiKeyEncrypted: provider.apiKeyEncrypted,
    })
    return ok(models)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取第一个启用的服务商（用于任务模型配置未配置时的回退）
export async function getEnabledProvider(): Promise<ServiceResult<ModelProvider | null>> {
  try {
    const wsResult = await getDefaultWorkspaceId()
    if (!wsResult.ok) return err(wsResult.error)
    const providers = await repoListProviders(wsResult.data)
    const enabled = providers.find((p) => p.enabled) ?? null
    return ok(enabled)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取任务类型对应模型的上下文窗口大小
///
/// 用于 ContextService.previewContext 的预压缩：
/// 1. 查询任务模型配置 → 查询对应服务商的 defaultModelContextLength
/// 2. 未配置任务时回退到第一个启用服务商的 defaultModelContextLength
/// 3. 返回 null 表示未知，调用方应跳过预压缩
export async function getTaskModelContextLength(
  taskType: ModelTaskType,
): Promise<number | null> {
  const configResult = await getConfigByTask(taskType)
  if (configResult.ok && configResult.data) {
    const provider = await findProviderById(configResult.data.providerId)
    if (provider) {
      return provider.defaultModelContextLength
    }
  }
  // 回退到第一个启用的服务商
  const providerResult = await getEnabledProvider()
  if (providerResult.ok && providerResult.data) {
    return providerResult.data.defaultModelContextLength
  }
  return null
}
