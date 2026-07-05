// 拼写检查 Service
// 调用模型检测文档中的中文错别字、语法错误与用词问题
//
// 调用路径：UI → SpellCheckService → ModelService → modelGateway
// 不直接访问 DB（除 documentRepository 查文档内容），不混入 UI 逻辑
//
// 架构约束：
// - 返回 ServiceResult<SpellCheckIssue[]>
// - 错误统一转换
// - 不持久化检查结果（每次实时检查）

import type {
  ModelMessage,
  SpellCheckIssue,
  SpellCheckIssueKind,
  EntityId,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { findDocumentById } from '@/services/database/documentRepository'
import {
  callModel,
  callModelDirect,
  getConfigByTask,
  getEnabledProvider,
} from '@/services/model/ModelService'
import { NOT_FOUND, MODEL_NOT_CONFIGURED, SPELL_CHECK_PARSE_FAILED } from '@/constants/errors'
import { SPELL_CHECK_PROMPT } from './spellCheckPrompts'

// ============ 常量 ============

/// 单次检查输入内容最大长度（与 KnowledgeExtractor 保持一致）
const MAX_INPUT_LENGTH = 8000

/// 合法的错误类型集合
const VALID_KINDS: readonly SpellCheckIssueKind[] = ['typo', 'grammar', 'usage']

// ============ Service 方法 ============

/// 检查文档拼写与用词问题
///
/// @param documentId 文档 ID
/// @returns 拼写检查问题列表（空列表表示无问题或文档为空）
export async function checkSpelling(
  documentId: EntityId,
): Promise<ServiceResult<SpellCheckIssue[]>> {
  try {
    const document = await findDocumentById(documentId)
    if (!document) {
      return err({ code: NOT_FOUND, message: '文档不存在', retryable: false })
    }

    // 提取纯文本
    const content = extractTextFromContentJson(document.contentJson)
    if (!content.trim()) {
      return ok([])
    }

    // 截断超长内容
    const truncated = content.slice(0, MAX_INPUT_LENGTH)

    const messages: ModelMessage[] = [
      { role: 'system', content: SPELL_CHECK_PROMPT },
      {
        role: 'user',
        content: `请检查以下文本的错别字、语法与用词问题：\n\n${truncated}`,
      },
    ]

    const rawResult = await invokeModel(messages)
    if (!rawResult.ok) return err(rawResult.error)

    return parseIssues(rawResult.data)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部工具 ============

/// 调用模型进行拼写检查，返回原始文本
///
/// 调用策略：优先使用 chat 任务模型配置，回退到第一个启用的服务商
async function invokeModel(
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
      code: MODEL_NOT_CONFIGURED,
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

/// 从模型输出中解析拼写检查问题列表
///
/// 容错策略：提取第一个 { 到最后一个 } 之间的内容作为 JSON
/// JSON 解析失败时返回错误，字段格式不匹配时返回空列表（容错）
function parseIssues(rawContent: string): ServiceResult<SpellCheckIssue[]> {
  const start = rawContent.indexOf('{')
  const end = rawContent.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    return err({
      code: SPELL_CHECK_PARSE_FAILED,
      message: '校对结果解析失败',
      retryable: true,
    })
  }
  try {
    const parsed = JSON.parse(rawContent.slice(start, end + 1)) as {
      issues?: unknown
    }
    if (!Array.isArray(parsed.issues)) return ok([])
    return ok(
      parsed.issues
        .filter((it): it is SpellCheckIssue => {
          if (typeof it !== 'object' || it === null) return false
          const d = it as Record<string, unknown>
          return (
            typeof d.kind === 'string' &&
            (VALID_KINDS as readonly string[]).includes(d.kind) &&
            typeof d.original === 'string' &&
            typeof d.description === 'string' &&
            d.original.trim().length > 0
          )
        })
        .map((d) => ({
          kind: d.kind,
          original: d.original,
          description: d.description,
          suggestion:
            typeof d.suggestion === 'string' ? d.suggestion : null,
        })),
    )
  } catch {
    return err({
      code: SPELL_CHECK_PARSE_FAILED,
      message: '校对结果解析失败',
      retryable: true,
    })
  }
}

/// 从 TipTap contentJson 中递归提取纯文本
///
/// 与 DocumentEditorPage.extractTextFromContentJson 逻辑一致，
/// 此处为 Service 层独立实现，避免 UI 与 Service 耦合
function extractTextFromContentJson(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as { text?: string; content?: unknown[] }
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return n.content.map((c) => extractTextFromContentJson(c)).join('')
  }
  return ''
}
