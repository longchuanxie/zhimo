// 上下文 LLM 摘要器
// 当上下文超限时，用 LLM 生成语义摘要替代原始条目
//
// 对应文档：06_工程实施补齐/06_Agent提示词与ContextPack组装规则_v1.0.md
// 借鉴：Claude Code auto-compact + ACON 压缩指南优化
//
// 核心功能：
// - summarizeContextEntries：对上下文条目进行语义压缩
// - summarizeMessages：对 Agent 对话历史进行压缩
//
// 压缩策略（ACON 风格）：
// - 提取关键决策（decisions）
// - 提取已建立的事实（facts）
// - 保留开放问题（open_questions）
// - 保留叙事主线（narrative）

import type { ContextEntry, AgentMessage } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { MODEL_NOT_CONFIGURED, CONTEXT_EMPTY } from '@/constants/errors'
import { getEnabledProvider } from '@/services/model/ModelService'
import { callModelDirect } from '@/services/model/ModelService'
import type { ModelMessage } from '@/types'
import { compactContext, DEFAULT_PRIORITY_MAP } from './ContextCompactor'
import { estimateTokens } from '@/utils/tokenEstimate'

// ============ 类型定义 ============

/// 摘要结果
export interface SummarizationResult {
  summary: string
  keyDecisions: string[]
  openQuestions: string[]
  preservedFacts: string[]
  narrative: string
}

/// 压缩上下文条目后的结果
export interface SummarizedEntriesResult {
  entries: ContextEntry[]
  summary: string
  totalTokens: number
}

// ============ 系统提示词 ============

/// 上下文摘要系统提示词
const SUMMARIZATION_SYSTEM_PROMPT = `你是一个专业的写作助手上下文压缩专家。你的任务是将冗长的上下文压缩成简洁但信息完整的摘要。

压缩原则：
1. 保留核心意图和目标
2. 提取关键决策和结论
3. 记录已建立的重要事实
4. 标记尚未解决的开放问题
5. 保持叙事主线连贯

输出格式要求：
- 用 JSON 格式输出，包含以下字段：
  - summary：整体摘要（50-100字）
  - keyDecisions：关键决策列表（每条20字以内）
  - preservedFacts：保留的事实列表（每条20字以内）
  - openQuestions：开放问题列表（每条20字以内）
  - narrative：叙事主线（30字以内）

重要：
- 只输出 JSON，不要有其他内容
- 确保所有字段都有值（可以是空数组）
- 中文输出`

// ============ 摘要提示词生成 ============

/// 生成上下文摘要的提示词
function buildContextSummarizationPrompt(entries: ContextEntry[]): string {
  const entriesText = entries
    .filter((e) => !e.excluded)
    .map((e) => {
      const prefix = e.required ? '[必选]' : '[可选]'
      return `${prefix}[${e.kind}] ${e.title}:\n${e.preview}`
    })
    .join('\n\n---\n\n')

  return `请将以下上下文条目压缩成简洁摘要：

${entriesText}

请提取关键信息并以 JSON 格式输出。`
}

/// 生成对话历史摘要的提示词
function buildMessagesSummarizationPrompt(messages: AgentMessage[]): string {
  const messagesText = messages
    .map((m) => {
      const role = m.role === 'user' ? '用户' : '助手'
      return `[${role}] ${m.content}`
    })
    .join('\n\n---\n\n')

  return `请将以下对话历史压缩成简洁摘要：

${messagesText}

请提取关键信息并以 JSON 格式输出。`
}

// ============ 解析摘要结果 ============

/// 解析 LLM 返回的 JSON 摘要
function parseSummarizationResult(content: string): SummarizationResult | null {
  try {
    // 尝试提取 JSON（可能包含在 markdown 代码块中）
    let jsonStr = content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    // 也可能 JSON 在文本中
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }

    const parsed = JSON.parse(jsonStr)
    return {
      summary: parsed.summary ?? '',
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
      preservedFacts: Array.isArray(parsed.preservedFacts) ? parsed.preservedFacts : [],
      narrative: parsed.narrative ?? '',
    }
  } catch {
    // 解析失败，返回空结果
    return null
  }
}

// ============ 核心功能 ============

/// 对上下文条目进行 LLM 语义压缩
///
/// 当上下文超限时，调用 LLM 生成摘要替代原始条目
/// 压缩后保留：关键决策、事实、开放问题、叙事主线
///
/// @param entries 原始上下文条目
/// @param targetTokenCount 目标 token 数
/// @returns 压缩后的条目 + 摘要信息
export async function summarizeContextEntries(
  entries: ContextEntry[],
  targetTokenCount: number,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<ServiceResult<SummarizedEntriesResult>> {
  try {
    // 1. 先尝试启发式压缩（如果能达标就不调用 LLM）
    const compactResult = compactContext(entries, targetTokenCount * 2, 'medium', {
      priorityMap: DEFAULT_PRIORITY_MAP,
    })
    if (compactResult.totalTokens <= targetTokenCount) {
      return ok({
        entries: compactResult.entries,
        summary: buildCompactSummary(compactResult.compactedItems),
        totalTokens: compactResult.totalTokens,
      })
    }

    // 2. 启发式压缩不够，需要 LLM 语义压缩
    // 2.1 获取模型
    const providerResult = await getEnabledProvider()
    if (!providerResult.ok || !providerResult.data) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '未配置可用的模型服务商',
        retryable: false,
      })
    }

    const provider = providerResult.data
    const modelName = provider.defaultModelName

    // 2.2 构造消息
    const messages: ModelMessage[] = [
      { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
      { role: 'user', content: buildContextSummarizationPrompt(entries) },
    ]

    // 2.3 调用模型
    const modelResult = await callModelDirect({
      provider,
      modelName,
      messages,
      temperature: 0.3, // 低温度确保输出稳定
      maxOutputTokens: 1024,
      timeoutMs: options?.timeoutMs ?? 30000,
      signal: options?.signal,
    })

    if (!modelResult.ok) {
      return err(modelResult.error)
    }

    // 2.4 解析结果
    const summarization = parseSummarizationResult(modelResult.data.content)
    if (!summarization) {
      // 解析失败，回退到启发式压缩
      return ok({
        entries: compactResult.entries,
        summary: buildCompactSummary(compactResult.compactedItems),
        totalTokens: compactResult.totalTokens,
      })
    }

    // 2.5 构造压缩后的条目
    const summarizedEntries = buildSummarizedEntries(summarization)

    // 2.6 验证压缩后大小
    const estimatedTokens = estimateSummarizationTokens(summarizedEntries)
    if (estimatedTokens > targetTokenCount) {
      // 仍然超限，进一步截断
      const fallbackResult = compactContext(entries, targetTokenCount, 'aggressive', {
        priorityMap: DEFAULT_PRIORITY_MAP,
      })
      return ok({
        entries: fallbackResult.entries,
        summary: summarization.summary,
        totalTokens: fallbackResult.totalTokens,
      })
    }

    return ok({
      entries: summarizedEntries,
      summary: summarization.summary,
      totalTokens: estimatedTokens,
    })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 对 Agent 对话历史进行 LLM 压缩
///
/// 当对话超过一定轮数时，压缩旧消息为摘要
///
/// @param messages 对话消息列表
/// @returns 压缩后的摘要消息
export async function summarizeMessages(
  messages: AgentMessage[],
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<ServiceResult<AgentMessage>> {
  try {
    if (messages.length === 0) {
      return err({
        code: CONTEXT_EMPTY,
        message: '没有可压缩的消息',
        retryable: false,
      })
    }

    // 获取模型
    const providerResult = await getEnabledProvider()
    if (!providerResult.ok || !providerResult.data) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '未配置可用的模型服务商',
        retryable: false,
      })
    }

    const provider = providerResult.data

    // 构造消息
    const promptMessages: ModelMessage[] = [
      { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
      { role: 'user', content: buildMessagesSummarizationPrompt(messages) },
    ]

    // 调用模型
    const modelResult = await callModelDirect({
      provider,
      modelName: provider.defaultModelName,
      messages: promptMessages,
      temperature: 0.3,
      maxOutputTokens: 1024,
      timeoutMs: options?.timeoutMs ?? 30000,
      signal: options?.signal,
    })

    if (!modelResult.ok) {
      return err(modelResult.error)
    }

    // 解析结果
    const summarization = parseSummarizationResult(modelResult.data.content)
    const summaryText = summarization
      ? formatSummarizationAsText(summarization)
      : `[对话摘要] ${modelResult.data.content.substring(0, 200)}...`

    // 返回一个助手消息作为摘要
    const summaryMessage: AgentMessage = {
      id: '', // 调用方填充
      threadId: messages[0]?.threadId ?? '',
      projectId: messages[0]?.projectId ?? '',
      role: 'assistant',
      content: summaryText,
      structuredOutput: summarization,
      explanation: null,
      contextPackId: null,
      agentRunId: null,
      adoptionStatus: 'not_applied',
      savedAsCardId: null,
      savedAsKnowledgeId: null,
      createdAt: new Date().toISOString(),
    }

    return ok(summaryMessage)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 辅助函数 ============

/// 估算摘要条目的 token 数
function estimateSummarizationTokens(entries: ContextEntry[]): number {
  return entries.reduce((sum, e) => sum + e.tokenEstimate, 0)
}

/// 构建压缩摘要文本
function buildCompactSummary(
  compactedItems: Array<{ title: string; action: string; originalTokens: number; newTokens: number }>,
): string {
  if (compactedItems.length === 0) return ''
  const excluded = compactedItems.filter((i) => i.action === 'excluded').length
  const truncated = compactedItems.filter((i) => i.action === 'truncated').length
  return `[压缩摘要] 已排除 ${excluded} 条，已截断 ${truncated} 条`
}

/// 将摘要结果转换为压缩后的上下文条目
function buildSummarizedEntries(summarization: SummarizationResult): ContextEntry[] {
  const entries: ContextEntry[] = []

  // 叙事主线
  if (summarization.narrative) {
    entries.push({
      kind: 'previous_message',
      refId: null,
      title: '对话主线',
      preview: summarization.narrative,
      tokenEstimate: estimateTokens(summarization.narrative),
      required: true,
      excluded: false,
    })
  }

  // 整体摘要
  if (summarization.summary) {
    entries.push({
      kind: 'previous_message',
      refId: null,
      title: '上下文摘要',
      preview: summarization.summary,
      tokenEstimate: estimateTokens(summarization.summary),
      required: true,
      excluded: false,
    })
  }

  // 关键决策
  for (const decision of summarization.keyDecisions.slice(0, 5)) {
    entries.push({
      kind: 'previous_message',
      refId: null,
      title: `决策：${decision.substring(0, 20)}`,
      preview: decision,
      tokenEstimate: estimateTokens(decision),
      required: false,
      excluded: false,
    })
  }

  // 保留的事实
  for (const fact of summarization.preservedFacts.slice(0, 5)) {
    entries.push({
      kind: 'previous_message',
      refId: null,
      title: `事实：${fact.substring(0, 20)}`,
      preview: fact,
      tokenEstimate: estimateTokens(fact),
      required: false,
      excluded: false,
    })
  }

  // 开放问题
  for (const question of summarization.openQuestions.slice(0, 3)) {
    entries.push({
      kind: 'previous_message',
      refId: null,
      title: `待解决问题：${question.substring(0, 20)}`,
      preview: question,
      tokenEstimate: estimateTokens(question),
      required: false,
      excluded: false,
    })
  }

  return entries
}

/// 将摘要格式化为纯文本
function formatSummarizationAsText(summarization: SummarizationResult): string {
  const parts: string[] = []

  if (summarization.narrative) {
    parts.push(`【主线】${summarization.narrative}`)
  }
  if (summarization.summary) {
    parts.push(`【摘要】${summarization.summary}`)
  }
  if (summarization.keyDecisions.length > 0) {
    parts.push(`【决策】${summarization.keyDecisions.join('；')}`)
  }
  if (summarization.preservedFacts.length > 0) {
    parts.push(`【事实】${summarization.preservedFacts.join('；')}`)
  }
  if (summarization.openQuestions.length > 0) {
    parts.push(`【待解决】${summarization.openQuestions.join('；')}`)
  }

  return parts.join('\n')
}
