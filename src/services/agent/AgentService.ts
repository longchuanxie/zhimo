// Agent Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §10
// 对应文档：06_工程实施补齐/06_Agent提示词与ContextPack组装规则_v1.0.md
// 对应任务：DEV-073 / DEV-074 / DEV-075
//
// 职责：
// - 创建/查询对话线程
// - 发送用户消息并执行助手运行
// - 保存助手回复（含 explanation）
// - 更新消息采纳状态
//
// 调用流程：
// 用户动作 → 预览上下文 → 用户确认 → 创建 ContextPack → sendMessage
//   → 创建用户消息 → 创建 AgentRun → 调用模型 → 保存助手消息 → 更新线程

import type {
  AgentThread,
  AgentMessage,
  AgentRun,
  AgentRole,
  BoundObjectType,
  ContextScope,
  AdoptionStatus,
  AgentExplanation,
  AgentTaskType,
  ModelTaskType,
  ModelMessage,
  ModelProvider,
  ModelResult,
  ContextPack,
  EntityId,
  ToolDefinition,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  VALIDATION_ERROR,
  NOT_FOUND,
  AGENT_THREAD_NOT_FOUND,
  MODEL_NOT_CONFIGURED,
  MODEL_CONTEXT_TOO_LONG,
  MODEL_CONTEXT_COMPACT_FAILED,
} from '@/constants/errors'
import {
  listThreads as repoListThreads,
  findThreadById,
  findThreadByBoundObject,
  insertThread,
  bumpThreadMessageStats,
  archiveThread,
  listMessages as repoListMessages,
  findMessageById,
  insertMessage,
  updateMessageAdoption,
  updateThreadSummary,
  updateThreadTitle,
  findRunById,
  insertRun,
  markRunRunning,
  markRunSucceeded,
  markRunFailed,
  markRunCancelled,
  updateRunModelInfo,
} from '@/services/database/agentRepository'
import { findContextPackById } from '@/services/database/contextRepository'
import { compactContext, determineCompressionLevel, DEFAULT_PRIORITY_MAP } from '@/services/context/ContextCompactor'
import { summarizeContextEntries, summarizeMessages } from '@/services/context/ContextSummarizer'
import { buildContextSummary } from '@/services/context/ContextService'
import { callModel, callModelDirect, getConfigByTask, getEnabledProvider, getTaskModelContextLength } from '@/services/model/ModelService'
import { generateId } from '@/services/database/mapping'
import { estimateTokens } from '@/utils/tokenEstimate'
import { createMemory } from '@/services/agent/AgentMemoryService'
import { PAPER_PROOFREAD_PROMPT } from '@/services/agent/paperPrompts'
import {
  ALL_PROJECT_TOOLS,
  createAllToolExecutors,
  PendingActionCollector,
} from '@/services/agent/tools'
import {
  insertPendingAction,
} from '@/services/database/agentPendingActionRepository'
import type { PendingToolAction } from '@/types'
import { extractFromConversation } from '@/services/knowledge/KnowledgeExtractor'
import { createKnowledge } from '@/services/knowledge/KnowledgeService'
import {
  analyzeEpisodeWritingIntent,
  type WritingIntentPreflight,
} from '@/services/agent/WritingIntentService'
import { buildAgentExecutionProtocol } from '@/services/agent/AgentExecutionProtocol'
import { buildAgentPlan } from '@/services/agent/AgentPlanService'
import { selectToolsForAgentPlan } from '@/services/agent/AgentToolPolicyService'
import {
  buildMissingRequiredToolErrorMessage,
  buildMissingRequiredToolRetryInstruction,
  validateRequiredTools,
} from '@/services/agent/AgentToolRequirementService'
import { recordWritingIntentClarification } from '@/services/agent/AgentThreadStateService'

// ============ 类型定义 ============

export type CreateThreadInput = {
  projectId: string
  agentRole: AgentRole
  boundObjectType: BoundObjectType
  boundObjectId?: string
  title?: string
  contextScope?: ContextScope
}

export type SendMessageInput = {
  projectId: string
  threadId: string
  content: string
  /// 已创建的 ContextPack ID
  contextPackId: string
  /// 任务类型（决定使用哪个模型配置），默认 chat
  taskType?: AgentTaskType
  /// 取消信号
  signal?: AbortSignal
}

export type SendMessageResult = {
  userMessage: AgentMessage
  run: AgentRun
  assistantMessage: AgentMessage
  /// 本次工具循环产生的待确认操作列表（写工具收集，需用户在 UI 确认后落地）
  pendingActions: PendingToolAction[]
}

export type SaveAssistantMessageInput = {
  projectId: string
  threadId: string
  runId: string
  content: string
  explanation?: AgentExplanation
  contextPackId?: string
}

export type UpdateAdoptionInput = {
  messageId: string
  adoptionStatus: AdoptionStatus
  savedAsCardId?: string
  savedAsKnowledgeId?: string
}

// ============ 系统提示词 ============

/// 通用系统提示词（对应设计文档 §3）
const SYSTEM_PROMPT = `你是知墨中的智能写作助手。
你必须基于用户当前项目的资料、卡片、大纲、知识和当前文本提供帮助。
你必须同时参考本轮对话中之前的用户消息和助手回复，保持上下文连贯；如果用户的问题涉及前文内容，请基于前文回应，不要重复询问已经提供的信息。
你不能编造不存在的资料来源。
你不能展示原始思维链。
你需要在输出后给出"为什么这样建议"的简明解释，包括：
1. 你理解的任务
2. 你参考的内容
3. 你的主要判断
4. 你的修改理由
5. 仍不确定的地方
如果上下文不足，你必须明确说明需要补充什么。
AI 输出不得直接替换用户正文，必须等待用户确认。

你的回复必须严格包含两部分，且两部分之间不要有任何额外说明：
1. 【建议内容】主体回复：仅包含用户可以直接采纳的写作内容，不得包含"为什么这样建议"等解释性文字
2. 【为什么这样建议】JSON 格式的解释：必须完整包裹在 <explanation>...</explanation> 标签中，不要以中文标题形式输出

解释 JSON 结构：
{
  "taskUnderstanding": "你理解的任务",
  "referencedContext": ["参考的内容1", "参考的内容2"],
  "mainJudgements": ["主要判断1"],
  "revisionReasons": ["修改理由1"],
  "uncertainties": ["不确定的地方1"]
}

示例输出格式：
这里是给用户的主体建议内容。
<explanation>{"taskUnderstanding": "扩写当前段落", "referencedContext": ["项目资料 A"], "mainJudgements": ["需要增加细节描写"], "revisionReasons": ["提升画面感"], "uncertainties": ["缺少具体场景参考"]}</explanation>

你可以通过工具查询和操作项目内容：
- 查询类工具（如 list_outline_nodes / get_document / search_cards / search_knowledge）会立即返回结果
- 写入类工具（如 create_outline_node / create_card / create_knowledge 等）不会立即执行，而是生成"待确认操作"
- 调用写入类工具后，计划、工具判断和风险必须写入 <explanation> JSON；如果主体回复是可采纳正文，主体只保留正文，不要混入计划说明
- 不要在一次对话中发起过多写入操作，优先用查询工具了解现状再决定`

/// 自动命名会话的提示词
/// 要求模型根据用户首条消息生成不超过 12 字的中文标题
const AUTO_TITLE_PROMPT = `请根据以下用户消息,生成一个不超过 12 个汉字的标题。
要求:
- 只输出标题文本,不要任何解释、标点、引号
- 概括用户意图,不要包含"对话""讨论"等冗词
- 使用中文

用户消息:
{content}`

// ============ Service 方法 ============

/// 查询项目的对话线程列表
///
/// @param projectId 项目 ID
/// @param limit 最大返回数量（默认 50）
export async function listThreads(
  projectId: string,
  limit?: number,
): Promise<ServiceResult<AgentThread[]>> {
  try {
    const threads = await repoListThreads(projectId, limit)
    return ok(threads)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询线程详情
export async function getThread(
  threadId: string,
): Promise<ServiceResult<AgentThread>> {
  try {
    const thread = await findThreadById(threadId)
    if (!thread) {
      return err({
        code: AGENT_THREAD_NOT_FOUND,
        message: '没有找到助手对话',
        retryable: false,
      })
    }
    return ok(thread)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询或创建绑定到指定对象的线程
export async function getOrCreateThreadByBoundObject(
  input: CreateThreadInput,
): Promise<ServiceResult<AgentThread>> {
  try {
    // 如果有 boundObjectId，先查找现有线程
    if (input.boundObjectId) {
      const existing = await findThreadByBoundObject(
        input.projectId,
        input.boundObjectType,
        input.boundObjectId,
      )
      if (existing) return ok(existing)
    }
    return createThread(input)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 创建对话线程
export async function createThread(
  input: CreateThreadInput,
): Promise<ServiceResult<AgentThread>> {
  try {
    if (!input.title?.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '对话标题不能为空',
        retryable: false,
      })
    }

    const threadId = generateId()
    await insertThread({
      id: threadId,
      projectId: input.projectId,
      title: input.title.trim(),
      agentRole: input.agentRole,
      boundObjectType: input.boundObjectType,
      boundObjectId: input.boundObjectId ?? null,
      contextScope: input.contextScope ?? 'current_object',
    })

    const thread = await findThreadById(threadId)
    if (!thread) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '线程创建后查询失败',
        retryable: true,
      })
    }
    return ok(thread)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询线程的消息列表
///
/// @param threadId 线程 ID
/// @param limit 最大返回数量（默认 100，仅返回最近的消息）
export async function listMessages(
  threadId: string,
  limit?: number,
): Promise<ServiceResult<AgentMessage[]>> {
  try {
    const messages = await repoListMessages(threadId, limit)
    return ok(messages)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 模型调用结果类型（用于重试辅助函数签名）
type ModelCallResult = ServiceResult<ModelResult>

/// 模型调用函数类型
type ModelInvoker = (
  messages: ModelMessage[],
  signal?: AbortSignal,
) => Promise<ModelCallResult>

/// 上下文过长时自动压缩重试
///
/// 当模型调用返回 MODEL_CONTEXT_TOO_LONG 时：
/// 1. 计算 retry 目标 token（预留 30% 给系统提示、用户指令和模型输出）
/// 2. 优先使用 LLM 语义压缩（summarizeContextEntries）
/// 3. LLM 压缩失败则回退到结构化压缩（compactContext aggressive）
/// 4. 旧数据无 entries 时简单截断 contextSummary
/// 5. 重新调用模型；若仍超限返回 MODEL_CONTEXT_COMPACT_FAILED
///
/// @param originalResult 首次调用结果（应为 MODEL_CONTEXT_TOO_LONG 错误）
/// @param contextPack 上下文快照
/// @param modelContextLength 模型上下文窗口大小（tokens）
/// @param signal 取消信号
/// @param invokeModel 模型调用函数
/// @param userContent 用户消息内容
/// @param historyMessages 历史对话消息
/// @param threadSummary 线程摘要
/// @returns 最终调用结果（成功或 MODEL_CONTEXT_COMPACT_FAILED）
async function retryWithCompactedContext(
  originalResult: ModelCallResult,
  contextPack: ContextPack,
  modelContextLength: number | null,
  signal: AbortSignal | undefined,
  invokeModel: ModelInvoker,
  userContent: string,
  historyMessages: ModelMessage[],
  threadSummary: string | null,
  taskType: AgentTaskType,
  boundObjectType: BoundObjectType | undefined,
  tools: ToolDefinition[],
): Promise<ModelCallResult> {
  // 仅处理 MODEL_CONTEXT_TOO_LONG 错误，其他直接返回原结果
  if (originalResult.ok || originalResult.error.code !== MODEL_CONTEXT_TOO_LONG) {
    return originalResult
  }

  // 预留 30% 给系统提示、用户指令和模型输出
  const retryTargetTokens = modelContextLength
    ? Math.floor(modelContextLength * 0.3)
    : Math.floor(contextPack.tokenEstimate * 0.3)

  let compactedSummary: string
  if (contextPack.entries.length > 0) {
    // LLM 语义压缩（借鉴 Claude Code auto-compact）
    const summaryResult = await summarizeContextEntries(
      contextPack.entries,
      retryTargetTokens,
      { signal, timeoutMs: 30000 },
    )
    if (summaryResult.ok) {
      compactedSummary = summaryResult.data.summary
    } else {
      // LLM 压缩失败，回退到结构化压缩
      const compactResult = compactContext(
        contextPack.entries,
        retryTargetTokens,
        'aggressive',
        { priorityMap: DEFAULT_PRIORITY_MAP },
      )
      compactedSummary = buildContextSummary(compactResult.entries)
    }
  } else {
    // 旧数据无 entries，简单截断 contextSummary 作为兜底
    const summary = contextPack.contextSummary ?? ''
    compactedSummary =
      summary.length > 1000
        ? summary.substring(0, 1000) + '\n...（已截断）'
        : summary
  }

  const retriedMessages = buildModelMessages(
    compactedSummary,
    userContent,
    historyMessages,
    threadSummary,
    taskType,
    boundObjectType,
    tools,
  )
  const retryResult = await invokeModel(retriedMessages, signal)

  // 压缩后仍超限，返回明确错误引导用户手动排除
  if (!retryResult.ok && retryResult.error.code === MODEL_CONTEXT_TOO_LONG) {
    return err({
      code: MODEL_CONTEXT_COMPACT_FAILED,
      message: '上下文过大，自动压缩后仍超限，请返回排除部分内容',
      retryable: false,
    })
  }

  return retryResult
}

/// 重命名对话线程
/// @internal autoRenameThreadIfNeeded 内部调用,也供 UI 手动改名使用
export async function renameThread(
  threadId: EntityId,
  title: string,
): Promise<ServiceResult<AgentThread>> {
  try {
    const trimmed = title.trim()
    if (!trimmed) {
      return err({
        code: VALIDATION_ERROR,
        message: '标题不能为空',
        retryable: false,
      })
    }
    // 截断到 12 字(按 Array.from 处理 Unicode)
    const truncated = Array.from(trimmed).slice(0, 12).join('')

    const existing = await findThreadById(threadId)
    if (!existing) {
      return err({
        code: AGENT_THREAD_NOT_FOUND,
        message: '没有找到助手对话',
        retryable: false,
      })
    }
    await updateThreadTitle(threadId, truncated)
    const updated = await findThreadById(threadId)
    if (!updated) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '线程更新后查询失败',
        retryable: true,
      })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 首回合后自动命名会话
///
/// 触发条件:
/// - thread.messageCount === 0(sendMessage 开始时查询的原始值,表示首回合)
/// - thread.title 以"新对话"开头(前端创建时的默认格式)
///
/// 行为:
/// - 调用 LLM 生成 ≤12 字标题,成功则更新
/// - LLM 失败或未配置模型 → 回退截取用户消息前 20 字
/// - 整个函数不抛错,失败时静默回退
///
/// @internal 由 sendMessage fire-and-forget 调用,不阻塞主流程
export async function autoRenameThreadIfNeeded(
  thread: AgentThread,
  userMessage: AgentMessage,
  _assistantMessage: AgentMessage,
): Promise<void> {
  // 1. 触发条件判定
  if (thread.messageCount !== 0) return
  if (!thread.title.startsWith('新对话')) return

  const fallbackTitle = Array.from(userMessage.content.trim()).slice(0, 20).join('')

  try {
    // 2. 获取模型配置(复用 sendMessage 的回退逻辑)
    const configResult = await getConfigByTask('chat')
    if (!configResult.ok) {
      await renameThread(thread.id, fallbackTitle).catch(() => {})
      return
    }

    let generatedTitle: string

    if (configResult.data) {
      const result = await callModel({
        modelConfigId: configResult.data.id,
        messages: [{
          role: 'user',
          content: AUTO_TITLE_PROMPT.replace('{content}', userMessage.content),
        }],
        temperature: 0,
        maxOutputTokens: 64,
      })
      if (!result.ok) {
        await renameThread(thread.id, fallbackTitle).catch(() => {})
        return
      }
      generatedTitle = result.data.content.trim()
    } else {
      // 回退到第一个启用的服务商
      const providerResult = await getEnabledProvider()
      if (!providerResult.ok || !providerResult.data) {
        await renameThread(thread.id, fallbackTitle).catch(() => {})
        return
      }
      const result = await callModelDirect({
        provider: providerResult.data,
        modelName: providerResult.data.defaultModelName,
        messages: [{
          role: 'user',
          content: AUTO_TITLE_PROMPT.replace('{content}', userMessage.content),
        }],
        temperature: 0,
      })
      if (!result.ok) {
        await renameThread(thread.id, fallbackTitle).catch(() => {})
        return
      }
      generatedTitle = result.data.content.trim()
    }

    // 3. LLM 返回空内容时回退
    if (!generatedTitle) {
      await renameThread(thread.id, fallbackTitle).catch(() => {})
      return
    }

    // 4. 更新标题(renameThread 内部会截断到 12 字)
    await renameThread(thread.id, generatedTitle)
  } catch {
    // 任何异常都静默回退
    await renameThread(thread.id, fallbackTitle).catch(() => {})
  }
}

/// 从对话中自动提取知识草稿并保存
///
/// 触发条件：sendMessage 中 thread.messageCount >= 4 时 fire-and-forget 调用
/// 行为：
/// - 查询线程最近 20 条消息
/// - 调用 extractFromConversation 提取知识草稿
/// - 批量 createKnowledge 保存为 pending 草稿
/// - 失败静默（fire-and-forget）
///
/// @internal 由 sendMessage fire-and-forget 调用，不阻塞主流程
async function extractAndSaveConversationKnowledge(
  projectId: string,
  threadId: string,
): Promise<void> {
  const messagesResult = await listMessages(threadId, 20)
  if (!messagesResult.ok) return

  const messages = messagesResult.data
  if (messages.length < 4) return

  const extractResult = await extractFromConversation({
    projectId,
    threadId,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })
  if (!extractResult.ok || extractResult.data.length === 0) return

  // 批量保存为 pending 草稿；失败静默（fire-and-forget，不干扰用户）
  for (const draft of extractResult.data) {
    await createKnowledge({
      projectId,
      title: draft.title,
      type: draft.type,
      content: draft.content,
      summary: draft.summary || undefined,
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      confidence: draft.confidence,
      aiUsageAllowed: true,
    }).catch(() => {})
  }
}

/// 发送用户消息并执行助手运行
///
/// 完整流程：
/// 1. 校验线程与 ContextPack
/// 2. 创建用户消息
/// 3. 创建 AgentRun
/// 4. 调用模型
/// 5. 解析助手回复与 explanation
/// 6. 保存助手消息
/// 7. 更新 AgentRun 状态
/// 8. 更新线程消息计数
export async function sendMessage(
  input: SendMessageInput,
): Promise<ServiceResult<SendMessageResult>> {
  let runId: EntityId | null = null

  try {
    // 1. 校验
    const thread = await findThreadById(input.threadId)
    if (!thread) {
      return err({
        code: AGENT_THREAD_NOT_FOUND,
        message: '没有找到助手对话',
        retryable: false,
      })
    }

    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '消息内容不能为空',
        retryable: false,
      })
    }

    const contextPack = await findContextPackById(input.contextPackId)
    if (!contextPack) {
      return err({
        code: NOT_FOUND,
        message: 'ContextPack 不存在',
        retryable: false,
      })
    }

    const taskType: AgentTaskType = input.taskType ?? 'answer_question'
    const modelTaskType = toModelTaskType(taskType)

    // 检查是否需要压缩历史消息（超过 20 轮时压缩前半部分为摘要）
    const compressedSummary = await compressThreadHistoryIfNeeded(thread, input.signal)
    const threadSummary = compressedSummary ?? thread.threadSummary

    const writingPreflight = await analyzeEpisodeWritingIntent({
      projectId: input.projectId,
      instruction: input.content,
      threadId: input.threadId,
    })
    if (!writingPreflight.ok) return err(writingPreflight.error)

    if (writingPreflight.data.kind === 'clarify') {
      return createWritingIntentClarificationResult({
        input,
        thread,
        message: writingPreflight.data.message,
        preflight: writingPreflight.data,
      })
    }

    const effectiveUserContent = appendWritingPreflightInstruction(
      input.content,
      writingPreflight.data,
    )
    const agentPlan = buildAgentPlan({
      userInstruction: input.content,
      taskType,
      boundObjectType: thread.boundObjectType,
      writingPreflight: writingPreflight.data,
      tools: ALL_PROJECT_TOOLS,
    })
    const tools = selectToolsForAgentPlan(agentPlan, ALL_PROJECT_TOOLS)

    // 2. 查询任务模型配置（未配置时回退到第一个启用的服务商）
    const configResult = await getConfigByTask(modelTaskType)
    if (!configResult.ok) {
      return err(configResult.error)
    }

    const modelConfig = configResult.data
    let fallbackProvider: ModelProvider | null = null
    let fallbackModelName: string | null = null

    if (!modelConfig) {
      // 回退：查询第一个启用的服务商
      const providerResult = await getEnabledProvider()
      if (!providerResult.ok) {
        return err(providerResult.error)
      }
      if (!providerResult.data) {
        return err({
          code: MODEL_NOT_CONFIGURED,
          message: '请先在设置中配置模型服务商',
          retryable: false,
        })
      }
      fallbackProvider = providerResult.data
      fallbackModelName = providerResult.data.defaultModelName
    }

    // 3. 创建用户消息
    const userMessageId = generateId()
    await insertMessage({
      id: userMessageId,
      threadId: input.threadId,
      projectId: input.projectId,
      role: 'user',
      content: input.content,
      structuredOutput: null,
      explanation: null,
      contextPackId: input.contextPackId,
      agentRunId: null,
      adoptionStatus: 'not_applied',
    })
    await bumpThreadMessageStats(input.threadId)

    const userMessage = await findMessageById(userMessageId)
    if (!userMessage) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '用户消息创建后查询失败',
        retryable: true,
      })
    }

    // 4. 创建 AgentRun
    const runIdInner = generateId()
    runId = runIdInner
    const runModelConfigId = modelConfig?.id ?? null
    const runModelName = modelConfig?.modelName ?? fallbackModelName ?? ''
    await insertRun({
      id: runIdInner,
      projectId: input.projectId,
      threadId: input.threadId,
      contextPackId: input.contextPackId,
      modelConfigId: runModelConfigId,
      modelName: runModelName,
    })
    await markRunRunning(runIdInner)
    await updateRunModelInfo(runIdInner, runModelConfigId, runModelName)

    // 5. 预压缩检查：根据上下文大小决定是否需要压缩
    //    借鉴 Claude Code auto-compact 策略
    const modelContextLength = await getTaskContextLength(taskType)
    const targetTokens = modelContextLength
      ? Math.floor(modelContextLength * 0.5) // 预留 50% 给系统提示、用户指令和模型输出
      : contextPack.tokenEstimate
    const estimatedTokens = estimateContextTokens(contextPack, effectiveUserContent)

    let contextSummary = contextPack.contextSummary ?? ''

    // 如果上下文超过 70%，触发预压缩
    const compressionLevel = determineCompressionLevel(estimatedTokens, targetTokens * 2)
    if (compressionLevel && contextPack.entries.length > 0) {
      const compactResult = compactContext(
        contextPack.entries,
        targetTokens,
        compressionLevel,
        { priorityMap: DEFAULT_PRIORITY_MAP },
      )
      contextSummary = buildContextSummary(compactResult.entries)
    }

    // 6. 构造模型调用消息
    //    加载历史对话（按 token 预算截断），实现多轮对话上下文连续性
    const historyTokenBudget = modelContextLength
      ? Math.floor(modelContextLength * 0.3) // 预留 30% 给历史对话
      : 4000
    const historyMessages = await loadHistoryMessages(
      input.threadId,
      userMessageId,
      historyTokenBudget,
    )

    const modelMessages = buildModelMessages(
      contextSummary,
      effectiveUserContent,
      historyMessages,
      threadSummary,
      taskType,
      thread.boundObjectType,
      tools,
    )

    // 6. 调用模型（有任务配置走 callModel，否则走 callModelDirect 回退）
    //    若返回 MODEL_CONTEXT_TOO_LONG，自动压缩 contextSummary 后重试一次
    //    所有任务启用 Tool Use，agent 可查询/操作大纲、正文、卡片、知识四个模块
    //    写工具不直接落库，由 collector 收集"待确认操作"，循环结束后持久化
    const collector = new PendingActionCollector()
    const toolExecutors = createAllToolExecutors(input.projectId, collector)

    const invokeModel = async (
      messages: ModelMessage[],
      signal?: AbortSignal,
    ) => {
      if (modelConfig) {
        return callModel({
          modelConfigId: modelConfig.id,
          messages,
          temperature: modelConfig.temperature,
          maxOutputTokens: modelConfig.maxOutputTokens,
          tools,
          toolChoice: tools ? 'auto' : undefined,
          signal,
        })
      }
      return callModelDirect({
        provider: fallbackProvider!,
        modelName: fallbackModelName!,
        messages,
        tools,
        toolChoice: tools ? 'auto' : undefined,
        signal,
      })
    }

    let callResult = await invokeModel(modelMessages, input.signal)

    // 上下文过长时自动压缩重试（提取为 retryWithCompactedContext）
    if (!callResult.ok && callResult.error.code === MODEL_CONTEXT_TOO_LONG) {
      callResult = await retryWithCompactedContext(
        callResult,
        contextPack,
        modelContextLength,
        input.signal,
        invokeModel,
        effectiveUserContent,
        historyMessages,
        threadSummary,
        taskType,
        thread.boundObjectType,
        tools,
      )

      // 压缩后仍超限，标记 Run 失败并返回
      if (!callResult.ok && callResult.error.code === MODEL_CONTEXT_COMPACT_FAILED) {
        await markRunFailed(runIdInner, callResult.error.code, callResult.error.message)
        return err(callResult.error)
      }
    }

    if (!callResult.ok) {
      // 检查是否为取消
      if (callResult.error.code === 'OPERATION_CANCELLED') {
        await markRunCancelled(runIdInner)
      } else {
        await markRunFailed(
          runIdInner,
          callResult.error.code,
          callResult.error.message,
        )
      }
      return err(callResult.error)
    }

    // 6.1 工具调用循环（最多 3 轮，防止死循环）
    //     模型返回 tool_calls 时执行对应工具，将结果以 role='tool' 消息回传后再次调用
    const MAX_TOOL_ROUNDS = 3
    const workingMessages: ModelMessage[] = [...modelMessages]
    let toolRounds = 0
    let totalToolCalls = 0

    while (
      callResult.ok &&
      callResult.data.toolCalls &&
      callResult.data.toolCalls.length > 0 &&
      toolRounds < MAX_TOOL_ROUNDS
    ) {
      toolRounds++
      const currentToolCalls = callResult.data.toolCalls
      totalToolCalls += currentToolCalls.length

      // 追加助手工具调用消息
      workingMessages.push({
        role: 'assistant',
        content: callResult.data.content,
        toolCalls: currentToolCalls,
      })

      // 执行每个工具调用并追加结果
      for (const tc of currentToolCalls) {
        const executor = toolExecutors.get(tc.function.name)
        let resultContent: string
        if (!executor) {
          resultContent = JSON.stringify({
            error: `未知工具：${tc.function.name}`,
          })
        } else {
          try {
            const parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>
            resultContent = await executor(parsedArgs)
          } catch (e) {
            resultContent = JSON.stringify({
              error: '工具执行失败',
              detail: e instanceof Error ? e.message : String(e),
            })
          }
        }
        workingMessages.push({
          role: 'tool',
          content: resultContent,
          toolCallId: tc.id,
        })
      }

      // 带工具结果再次调用模型
      callResult = await invokeModel(workingMessages, input.signal)
      if (!callResult.ok) {
        // 工具循环中出错，标记 Run 失败
        if (callResult.error.code === 'OPERATION_CANCELLED') {
          await markRunCancelled(runIdInner)
        } else {
          await markRunFailed(
            runIdInner,
            callResult.error.code,
            callResult.error.message,
          )
        }
        return err(callResult.error)
      }
    }

    let requirementValidation = validateRequiredTools({
      plan: agentPlan,
      pendingIntents: collector.snapshot(),
    })

    if (!requirementValidation.ok && callResult.ok) {
      workingMessages.push({
        role: 'assistant',
        content: callResult.data.content,
      })
      workingMessages.push({
        role: 'user',
        content: buildMissingRequiredToolRetryInstruction({
          plan: agentPlan,
          missingTools: requirementValidation.missingTools,
        }),
      })

      callResult = await invokeModel(workingMessages, input.signal)
      if (!callResult.ok) {
        if (callResult.error.code === 'OPERATION_CANCELLED') {
          await markRunCancelled(runIdInner)
        } else {
          await markRunFailed(
            runIdInner,
            callResult.error.code,
            callResult.error.message,
          )
        }
        return err(callResult.error)
      }

      while (
        callResult.ok &&
        callResult.data.toolCalls &&
        callResult.data.toolCalls.length > 0 &&
        toolRounds < MAX_TOOL_ROUNDS
      ) {
        toolRounds++
        const currentToolCalls = callResult.data.toolCalls
        totalToolCalls += currentToolCalls.length

        workingMessages.push({
          role: 'assistant',
          content: callResult.data.content,
          toolCalls: currentToolCalls,
        })

        for (const tc of currentToolCalls) {
          const executor = toolExecutors.get(tc.function.name)
          let resultContent: string
          if (!executor) {
            resultContent = JSON.stringify({
              error: `未知工具：${tc.function.name}`,
            })
          } else {
            try {
              const parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>
              resultContent = await executor(parsedArgs)
            } catch (e) {
              resultContent = JSON.stringify({
                error: '工具执行失败',
                detail: e instanceof Error ? e.message : String(e),
              })
            }
          }

          workingMessages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          })
        }

        callResult = await invokeModel(workingMessages, input.signal)
        if (!callResult.ok) {
          if (callResult.error.code === 'OPERATION_CANCELLED') {
            await markRunCancelled(runIdInner)
          } else {
            await markRunFailed(
              runIdInner,
              callResult.error.code,
              callResult.error.message,
            )
          }
          return err(callResult.error)
        }
      }

      requirementValidation = validateRequiredTools({
        plan: agentPlan,
        pendingIntents: collector.snapshot(),
      })
    }

    if (!requirementValidation.ok) {
      const message = buildMissingRequiredToolErrorMessage({
        missingTools: requirementValidation.missingTools,
      })
      await markRunFailed(runIdInner, VALIDATION_ERROR, message)
      return err({
        code: VALIDATION_ERROR,
        message,
        retryable: true,
      })
    }

    // 7. 解析助手回复
    let { content, explanation } = parseAssistantResponse(callResult.data.content)

    // 若模型因 max_tokens 截断，追加提示，避免用户误以为内容已结束
    if (callResult.data.finishReason === 'length') {
      content = `${content}\n\n[输出被模型截断，请要求 Agent 继续或拆分任务]`
    }

    // 若发生过工具调用，在 explanation 中标注工具使用情况
    const finalExplanation: AgentExplanation | null = totalToolCalls > 0
      ? {
          taskUnderstanding: explanation?.taskUnderstanding ?? '',
          referencedContext: [
            ...(explanation?.referencedContext ?? []),
            `本次通过工具操作项目内容（共 ${totalToolCalls} 次调用，${toolRounds} 轮，待确认操作 ${collector.size} 条）`,
          ],
          mainJudgements: explanation?.mainJudgements ?? [],
          revisionReasons: explanation?.revisionReasons ?? [],
          uncertainties: explanation?.uncertainties ?? [],
        }
      : explanation

    // 8. 保存助手消息
    const assistantMessageId = generateId()
    await insertMessage({
      id: assistantMessageId,
      threadId: input.threadId,
      projectId: input.projectId,
      role: 'assistant',
      content,
      structuredOutput: { agentPlan },
      explanation: finalExplanation,
      contextPackId: input.contextPackId,
      agentRunId: runIdInner,
      adoptionStatus: 'not_applied',
    })
    await bumpThreadMessageStats(input.threadId)

    // 8.1 持久化工具循环收集的待确认操作
    //     关联到刚创建的助手消息，UI 通过 messageId 查询并展示供用户确认
    const pendingIntents = collector.drain()
    const pendingActions: PendingToolAction[] = []
    for (const intent of pendingIntents) {
      const actionId = generateId()
      await insertPendingAction({
        id: actionId,
        messageId: assistantMessageId,
        projectId: input.projectId,
        threadId: input.threadId,
        toolName: intent.toolName,
        args: intent.args,
        summary: intent.summary,
        status: 'pending',
      })
      pendingActions.push({
        id: actionId,
        messageId: assistantMessageId,
        projectId: input.projectId,
        threadId: input.threadId,
        toolName: intent.toolName,
        args: intent.args,
        summary: intent.summary,
        status: 'pending',
        createdAt: new Date().toISOString(),
        appliedAt: null,
      })
    }

    // 9. 更新 AgentRun 状态
    await markRunSucceeded(
      runIdInner,
      callResult.data.inputTokens,
      callResult.data.outputTokens,
    )

    const assistantMessage = await findMessageById(assistantMessageId)
    if (!assistantMessage) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '助手消息创建后查询失败',
        retryable: true,
      })
    }

    const run = await findRunById(runIdInner)
    if (!run) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '运行记录查询失败',
        retryable: true,
      })
    }

    // 10. 首回合后异步自动命名(fire-and-forget,不阻塞返回)
    void autoRenameThreadIfNeeded(thread, userMessage, assistantMessage).catch(() => {})

    // 11. 多轮对话后自动提取知识草稿（fire-and-forget,不阻塞返回）
    //     触发条件：sendMessage 开始时 thread.messageCount >= 4（即已有 ≥2 轮对话）
    //     提取的知识保存为 pending 草稿，由用户在知识库审阅确认
    if (thread.messageCount >= 4) {
      void extractAndSaveConversationKnowledge(input.projectId, input.threadId).catch(() => {})
    }

    return ok({ userMessage, run, assistantMessage, pendingActions })
  } catch (error) {
    // 异常时标记运行失败
    console.error('[AgentService.sendMessage] 未捕获异常:', error)
    if (runId) {
      const appError = fromUnknown(error)
      await markRunFailed(runId, appError.code, appError.message).catch(() => {})
    }
    return err(fromUnknown(error))
  }
}

/// 单独保存助手消息（用于流式或手动场景）
async function createWritingIntentClarificationResult(input: {
  input: SendMessageInput
  thread: AgentThread
  message: string
  preflight: Extract<WritingIntentPreflight, { kind: 'clarify' }>
}): Promise<ServiceResult<SendMessageResult>> {
  const stateResult = await recordWritingIntentClarification({
    projectId: input.input.projectId,
    threadId: input.input.threadId,
    contextPackId: input.input.contextPackId,
    targetLabel: input.preflight.intent.targetLabel,
    documentId: input.preflight.document?.id ?? null,
    outlineNodeId: input.preflight.document?.outlineNodeId ?? null,
  })
  if (!stateResult.ok) return err(stateResult.error)

  const userMessageId = generateId()
  await insertMessage({
    id: userMessageId,
    threadId: input.input.threadId,
    projectId: input.input.projectId,
    role: 'user',
    content: input.input.content,
    structuredOutput: null,
    explanation: null,
    contextPackId: input.input.contextPackId,
    agentRunId: null,
    adoptionStatus: 'not_applied',
  })
  await bumpThreadMessageStats(input.input.threadId)

  const userMessage = await findMessageById(userMessageId)
  if (!userMessage) {
    return err({
      code: 'UNKNOWN_ERROR',
      message: '用户消息创建后查询失败',
      retryable: true,
    })
  }

  const runId = generateId()
  await insertRun({
    id: runId,
    projectId: input.input.projectId,
    threadId: input.input.threadId,
    contextPackId: input.input.contextPackId,
    modelConfigId: null,
    modelName: 'intent_preflight',
  })
  await markRunRunning(runId)

  const assistantMessageId = generateId()
  await insertMessage({
    id: assistantMessageId,
    threadId: input.input.threadId,
    projectId: input.input.projectId,
    role: 'assistant',
    content: input.message,
    structuredOutput: null,
    explanation: {
      taskUnderstanding: `用户想完成${input.preflight.intent.targetLabel}正文编写`,
      referencedContext: input.preflight.document
        ? [`已检查文档《${input.preflight.document.title}》`]
        : ['未找到对应大纲节点'],
      mainJudgements: input.preflight.document
        ? ['目标文档已有正文，直接写入可能覆盖或造成重复']
        : ['缺少明确的大纲节点，无法安全生成对应正文'],
      revisionReasons: ['先确认续写、重写或润色意图，再进入正文生成'],
      uncertainties: input.preflight.document
        ? ['用户尚未确认对已有正文的处理方式']
        : ['用户尚未确认要基于哪个大纲节点写作'],
    },
    contextPackId: input.input.contextPackId,
    agentRunId: runId,
    adoptionStatus: 'not_applied',
  })
  await bumpThreadMessageStats(input.input.threadId)
  await markRunSucceeded(runId, 0, 0)

  const assistantMessage = await findMessageById(assistantMessageId)
  const run = await findRunById(runId)
  if (!assistantMessage || !run) {
    return err({
      code: 'UNKNOWN_ERROR',
      message: '意图澄清消息创建后查询失败',
      retryable: true,
    })
  }

  void autoRenameThreadIfNeeded(input.thread, userMessage, assistantMessage).catch(() => {})

  return ok({
    userMessage,
    run,
    assistantMessage,
    pendingActions: [],
  })
}

function appendWritingPreflightInstruction(
  userInstruction: string,
  preflight: WritingIntentPreflight,
): string {
  if (preflight.kind !== 'proceed') return userInstruction
  return `${userInstruction}\n\n${preflight.instructionAddon}`
}

export async function saveAssistantMessage(
  input: SaveAssistantMessageInput,
): Promise<ServiceResult<AgentMessage>> {
  try {
    const messageId = generateId()
    await insertMessage({
      id: messageId,
      threadId: input.threadId,
      projectId: input.projectId,
      role: 'assistant',
      content: input.content,
      structuredOutput: null,
      explanation: input.explanation ?? null,
      contextPackId: input.contextPackId ?? null,
      agentRunId: input.runId,
      adoptionStatus: 'not_applied',
    })
    await bumpThreadMessageStats(input.threadId)

    const message = await findMessageById(messageId)
    if (!message) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '助手消息创建后查询失败',
        retryable: true,
      })
    }
    return ok(message)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新消息采纳状态
export async function updateMessageAdoptionService(
  input: UpdateAdoptionInput,
): Promise<ServiceResult<AgentMessage>> {
  try {
    const message = await findMessageById(input.messageId)
    if (!message) {
      return err({
        code: NOT_FOUND,
        message: '消息不存在',
        retryable: false,
      })
    }

    await updateMessageAdoption(
      input.messageId,
      input.adoptionStatus,
      input.savedAsCardId ?? null,
      input.savedAsKnowledgeId ?? null,
    )

    const updated = await findMessageById(input.messageId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '消息不存在',
        retryable: false,
      })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 归档线程
export async function archiveThreadService(
  threadId: string,
): Promise<ServiceResult<void>> {
  try {
    const thread = await findThreadById(threadId)
    if (!thread) {
      return err({
        code: AGENT_THREAD_NOT_FOUND,
        message: '没有找到助手对话',
        retryable: false,
      })
    }
    await archiveThread(threadId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取当前任务类型对应模型的上下文窗口大小
///
/// 用于 AgentPanel 在预览上下文时传入 modelMaxTokens 触发预压缩。
/// 返回 null 表示未知（未配置模型或服务商无 contextLength），调用方应跳过预压缩。
export async function getTaskContextLength(
  taskType: AgentTaskType,
): Promise<number | null> {
  const modelTaskType = toModelTaskType(taskType)
  return getTaskModelContextLength(modelTaskType)
}

// ============ 内部工具 ============

/// AgentTaskType → ModelTaskType 映射
/// AgentTaskType 包含更多任务类型，ModelTaskType 是模型配置的任务类型
/// 未直接对应的任务统一使用 chat 配置
function toModelTaskType(taskType: AgentTaskType): ModelTaskType {
  switch (taskType) {
    case 'rewrite':
    case 'expand':
    case 'summarize':
    case 'generate_outline':
    case 'generate_card':
      return taskType
    case 'check_source':
    case 'answer_question':
    case 'format_text':
      return 'chat'
    default:
      return 'chat'
  }
}

/// 构造模型调用消息
///
/// 消息结构：system（含参考内容与历史摘要）→ 历史对话 → 当前用户指令
///
/// 当 taskType === 'format_text' 且 boundObjectType === 'document' 时，
/// 使用论文校对专用 prompt（PAPER_PROOFREAD_PROMPT），严格检查引文/图表/公式/材料真实性。
export function buildModelMessages(
  contextSummary: string,
  userInstruction: string,
  historyMessages: ModelMessage[],
  threadSummary: string | null,
  taskType: AgentTaskType,
  boundObjectType: BoundObjectType | undefined,
  tools: ToolDefinition[] = ALL_PROJECT_TOOLS,
): ModelMessage[] {
  const usePaperPrompt =
    taskType === 'format_text' && boundObjectType === 'document'
  const basePrompt = usePaperPrompt ? PAPER_PROOFREAD_PROMPT : SYSTEM_PROMPT
  const executionProtocol = buildAgentExecutionProtocol({
    tools,
    taskType,
    boundObjectType,
  })
  const systemPrompt = `${basePrompt}\n\n${executionProtocol}`

  let systemContent = contextSummary
    ? `${systemPrompt}\n\n【本次参考内容】\n${contextSummary}`
    : systemPrompt

  // 如果存在历史对话摘要，追加到系统提示
  if (threadSummary) {
    systemContent += `\n\n【历史对话摘要】\n${threadSummary}`
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: systemContent },
  ]

  // 插入历史对话（已按 token 预算截断）
  if (historyMessages && historyMessages.length > 0) {
    messages.push(...historyMessages)
  }

  messages.push({ role: 'user', content: userInstruction })
  return messages
}

/// 解析助手回复，提取主体内容与 explanation
///
/// 支持的 explanation 格式（按优先级）：
/// 1. <explanation>...</explanation> 标签内的 JSON
/// 2. 【为什么这样建议】 中文标题后的 JSON
/// 3. 仅包含中文标题后的解释文本（非 JSON）—— 尝试按常见字段提取
function parseAssistantResponse(raw: string): {
  content: string
  explanation: AgentExplanation | null
} {
  // 1. 尝试提取 <explanation>...</explanation> 标签
  const tagMatch = raw.match(/<explanation>([\s\S]*?)<\/explanation>/i)
  if (tagMatch) {
    const explanationText = tagMatch[1]!.trim()
    const content = raw.replace(tagMatch[0], '').trim()
    const explanation = parseExplanationJson(explanationText)
    if (explanation) {
      return { content, explanation }
    }
  }

  // 2. 兜底：尝试按 【为什么这样建议】 中文标题分隔
  const marker = '【为什么这样建议】'
  const markerIndex = raw.indexOf(marker)
  if (markerIndex >= 0) {
    const content = raw.substring(0, markerIndex).trim()
    const explanationText = raw.substring(markerIndex + marker.length).trim()
    const explanation =
      parseExplanationJson(explanationText) ??
      parseExplanationText(explanationText)
    return { content, explanation }
  }

  // 3. 未识别到 explanation，返回原始内容
  return { content: raw.trim(), explanation: null }
}

/// 从 JSON 文本解析 explanation
function parseExplanationJson(text: string): AgentExplanation | null {
  try {
    const parsed = JSON.parse(text) as Partial<AgentExplanation>
    return normalizeExplanation(parsed)
  } catch {
    return null
  }
}

/// 从非 JSON 文本（如中文列表）中尽力提取 explanation
function parseExplanationText(text: string): AgentExplanation | null {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return null

  // 简单启发式：第一行作为 taskUnderstanding，其余作为 mainJudgements
  return {
    taskUnderstanding: lines[0] ?? '',
    referencedContext: [],
    mainJudgements: lines.slice(1),
    revisionReasons: [],
    uncertainties: [],
  }
}

/// 归一化 explanation，确保字段存在
function normalizeExplanation(
  parsed: Partial<AgentExplanation>,
): AgentExplanation {
  return {
    taskUnderstanding: parsed.taskUnderstanding ?? '',
    referencedContext: Array.isArray(parsed.referencedContext)
      ? parsed.referencedContext
      : [],
    mainJudgements: Array.isArray(parsed.mainJudgements)
      ? parsed.mainJudgements
      : [],
    revisionReasons: Array.isArray(parsed.revisionReasons)
      ? parsed.revisionReasons
      : [],
    uncertainties: Array.isArray(parsed.uncertainties)
      ? parsed.uncertainties
      : [],
  }
}

/// 估算当前上下文总 token 数
///
/// 包括：contextSummary + 用户指令 + 系统提示 + 预期输出预留
function estimateContextTokens(contextPack: { tokenEstimate: number; contextSummary: string | null }, userInstruction: string): number {
  // contextPack.tokenEstimate 已经包含了条目的 token 估算
  const entriesTokens = contextPack.tokenEstimate
  // 用户指令
  const userTokens = estimateTokens(userInstruction)
  // 系统提示约 500 tokens
  const systemTokens = 500
  // 预期输出预留约 500 tokens
  const outputTokens = 500

  return entriesTokens + userTokens + systemTokens + outputTokens
}

/// 加载线程历史消息并转换为 ModelMessage 格式
///
/// 策略：从最近的消息向前取，直到达到 token 预算或条数上限。
/// 排除当前刚创建的用户消息，跳过 system 消息。
///
/// @param threadId 线程 ID
/// @param excludeMessageId 需要排除的消息 ID（当前轮用户消息）
/// @param maxTokens 历史消息 token 预算
/// @returns 按时间正序排列的历史消息（role 为 'user' | 'assistant'）
async function loadHistoryMessages(
  threadId: string,
  excludeMessageId: string,
  maxTokens: number,
): Promise<ModelMessage[]> {
  // 只取最近 20 条，避免加载过多历史
  const messages = await repoListMessages(threadId, 20)
  // 排除当前消息
  const history = messages.filter((m) => m.id !== excludeMessageId)
  // 从最近向前取，直到达到预算
  const result: ModelMessage[] = []
  let usedTokens = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!
    if (msg.role === 'system') continue
    const tokens = estimateTokens(msg.content)
    if (usedTokens + tokens > maxTokens) break
    result.unshift({ role: msg.role, content: msg.content })
    usedTokens += tokens
  }
  return result
}

/// 检查并压缩历史消息
///
/// 当对话超过 20 轮时，用 LLM 将前半部分旧消息压缩为摘要，
/// 写入 thread_summary 字段。后续 buildModelMessages 会将摘要
/// 加入系统提示，实现"摘要 + 最近消息"的 Head-Tail 策略。
///
/// @returns 压缩后的摘要文本（若执行了压缩），否则返回 null
async function compressThreadHistoryIfNeeded(
  thread: AgentThread,
  signal?: AbortSignal,
): Promise<string | null> {
  // 超过 20 轮才需要压缩
  if (thread.messageCount < 20) return null

  // 取前半部分旧消息进行压缩（最多 20 条）
  const messages = await repoListMessages(thread.id, thread.messageCount)
  const halfCount = Math.min(20, Math.floor(messages.length / 2))
  const oldMessages = messages.slice(0, halfCount)

  if (oldMessages.length === 0) return null

  // 调用 LLM 生成摘要
  const summaryResult = await summarizeMessages(oldMessages, {
    signal,
    timeoutMs: 30000,
  })

  if (!summaryResult.ok) {
    // 压缩失败不阻塞主流程，保留原有 threadSummary
    return null
  }

  const summaryText = summaryResult.data.content
  await updateThreadSummary(thread.id, summaryText)

  // 将摘要保存为项目级记忆，实现跨会话共享
  // 置信度设为 0.6（自动提取，中等可信）
  await createMemory({
    projectId: thread.projectId,
    sourceThreadId: thread.id,
    kind: 'summary',
    content: `【对话摘要】${thread.title ?? '未命名会话'}\n${summaryText}`,
    confidence: 0.6,
  }).catch(() => {
    // 记忆保存失败不阻塞主流程
  })

  return summaryText
}
