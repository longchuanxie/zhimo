// 知识提取 Service
// 从文档/对话/资料中提取知识草稿，供用户审阅后保存
//
// 三种提取场景：
// - 文档：自动提取，保存为 pending 草稿（用户事后审阅）
// - 对话：自动提取（≥4 条消息触发），保存为 pending 草稿
// - 资料：半自动提取，UI 弹窗预览后用户勾选保存
//
// 调用路径：UI → KnowledgeExtractor → ModelService → modelGateway
// 不直接访问数据库，不混入 UI 逻辑

import type { ModelMessage } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  callModel,
  callModelDirect,
  getConfigByTask,
  getEnabledProvider,
} from '@/services/model/ModelService'
import type { KnowledgeType } from '@/constants/knowledgeTypes'

// ============ 类型定义 ============

/// 知识草稿（提取后未保存的知识条目）
export type KnowledgeDraft = {
  title: string
  type: KnowledgeType
  content: string
  summary: string
  confidence: number
  sourceType: 'document' | 'conversation' | 'source'
  sourceId: string
}

/// 提取来源类型
export type ExtractSource = 'document' | 'conversation' | 'source'

// ============ 常量 ============

const EXTRACT_PROMPT = `你是一个知识抽取助手。从以下内容中提取可作为长期创作参考的知识条目。
仅提取明确出现的事实/设定/规则，不要编造。每条知识包含：
- title: 简洁标题（≤30字）
- type: character/setting/worldview/plot/rule/fact 之一
- content: 详细内容
- summary: 一句话概括（≤50字）
- confidence: 0~1 置信度（明确提及的为 0.9，推断的为 0.6）

输出严格 JSON：{ "items": [...] }
若无可用知识，输出 { "items": [] }。`

/// 单次提取输入内容最大长度
const MAX_INPUT_LENGTH = 8000

// ============ 内部工具 ============

/// 调用模型进行提取，返回原始文本
async function invokeExtraction(
  messages: ModelMessage[],
): Promise<ServiceResult<string>> {
  const configResult = await getConfigByTask('chat')
  if (!configResult.ok) return err(configResult.error)

  if (configResult.data) {
    const r = await callModel({
      modelConfigId: configResult.data.id,
      messages,
      temperature: 0,
    })
    if (!r.ok) return err(r.error)
    return ok(r.data.content)
  }

  // 回退到第一个启用的服务商
  const providerResult = await getEnabledProvider()
  if (!providerResult.ok) return err(providerResult.error)
  if (!providerResult.data) {
    return err({
      code: 'MODEL_NOT_CONFIGURED',
      message: '请先在设置中配置模型服务商',
      retryable: false,
    })
  }
  const r = await callModelDirect({
    provider: providerResult.data,
    modelName: providerResult.data.defaultModelName,
    messages,
    temperature: 0,
  })
  if (!r.ok) return err(r.error)
  return ok(r.data.content)
}

/// 从模型输出中解析知识草稿列表
///
/// 容错策略：提取第一个 { 到最后一个 } 之间的内容作为 JSON
function parseDrafts(rawContent: string): KnowledgeDraft[] {
  const start = rawContent.indexOf('{')
  const end = rawContent.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) return []
  try {
    const parsed = JSON.parse(rawContent.slice(start, end + 1)) as {
      items?: unknown
    }
    if (!Array.isArray(parsed.items)) return []
    return parsed.items
      .filter((it): it is KnowledgeDraft => {
        if (typeof it !== 'object' || it === null) return false
        const d = it as Record<string, unknown>
        return (
          typeof d.title === 'string' &&
          typeof d.content === 'string' &&
          d.title.trim().length > 0 &&
          d.content.trim().length > 0
        )
      })
      .map((d) => ({
        title: d.title,
        type: d.type,
        content: d.content,
        summary: typeof d.summary === 'string' ? d.summary : '',
        confidence:
          typeof d.confidence === 'number' && d.confidence >= 0 && d.confidence <= 1
            ? d.confidence
            : 0.7,
        sourceType: 'fact' as ExtractSource, // 占位，由调用方覆盖
        sourceId: '', // 占位，由调用方覆盖
      }))
  } catch {
    return []
  }
}

// ============ Service 方法 ============

/// 从文档提取知识（自动，保存为草稿）
///
/// @param params.projectId 项目 ID
/// @param params.documentId 文档 ID
/// @param params.documentTitle 文档标题
/// @param params.documentContent 文档内容
export async function extractFromDocument(params: {
  projectId: string
  documentId: string
  documentTitle: string
  documentContent: string
}): Promise<ServiceResult<KnowledgeDraft[]>> {
  try {
    const messages: ModelMessage[] = [
      { role: 'system', content: EXTRACT_PROMPT },
      {
        role: 'user',
        content: `文档标题：${params.documentTitle}\n\n文档内容：\n${params.documentContent.slice(0, MAX_INPUT_LENGTH)}`,
      },
    ]
    const rawResult = await invokeExtraction(messages)
    if (!rawResult.ok) return err(rawResult.error)
    const drafts = parseDrafts(rawResult.data)
    return ok(
      drafts.map((d) => ({
        ...d,
        sourceType: 'document' as const,
        sourceId: params.documentId,
      })),
    )
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 从对话提取知识（自动，保存为草稿）
///
/// @param params.projectId 项目 ID
/// @param params.threadId 对话线程 ID
/// @param params.messages 对话消息列表（按时间顺序）
export async function extractFromConversation(params: {
  projectId: string
  threadId: string
  messages: Array<{ role: string; content: string }>
}): Promise<ServiceResult<KnowledgeDraft[]>> {
  try {
    const transcript = params.messages
      .slice(-20)
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n\n')
    const messages: ModelMessage[] = [
      { role: 'system', content: EXTRACT_PROMPT },
      {
        role: 'user',
        content: `以下是对话记录，提取其中明确提及的事实/设定/规则：\n\n${transcript}`,
      },
    ]
    const rawResult = await invokeExtraction(messages)
    if (!rawResult.ok) return err(rawResult.error)
    const drafts = parseDrafts(rawResult.data)
    return ok(
      drafts.map((d) => ({
        ...d,
        sourceType: 'conversation' as const,
        sourceId: params.threadId,
      })),
    )
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 从资料提取知识（半自动，UI 预览后保存）
///
/// @param params.projectId 项目 ID
/// @param params.sourceId 资料 ID
/// @param params.sourceTitle 资料标题
/// @param params.sourceContent 资料内容
export async function extractFromSource(params: {
  projectId: string
  sourceId: string
  sourceTitle: string
  sourceContent: string
}): Promise<ServiceResult<KnowledgeDraft[]>> {
  try {
    const messages: ModelMessage[] = [
      { role: 'system', content: EXTRACT_PROMPT },
      {
        role: 'user',
        content: `资料标题：${params.sourceTitle}\n\n资料内容：\n${params.sourceContent.slice(0, MAX_INPUT_LENGTH)}`,
      },
    ]
    const rawResult = await invokeExtraction(messages)
    if (!rawResult.ok) return err(rawResult.error)
    const drafts = parseDrafts(rawResult.data)
    return ok(
      drafts.map((d) => ({
        ...d,
        sourceType: 'source' as const,
        sourceId: params.sourceId,
      })),
    )
  } catch (error) {
    return err(fromUnknown(error))
  }
}
