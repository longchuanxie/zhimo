// ContextPack Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §9
// 对应文档：06_工程实施补齐/06_Agent提示词与ContextPack组装规则_v1.0.md
// 对应任务：DEV-079 / DEV-080 / DEV-081
//
// 职责：
// - previewContext：预览本次参考内容，应用排除规则
// - createContextPack：创建不可变快照
//
// 排除规则（强制）：
// - Source.ai_usage_allowed = false → 排除
// - Card.status = deprecated → 排除
// - Card.ai_usage_allowed = false → 排除
// - Knowledge.status = deprecated → 排除
// - Knowledge.status = forbidden → 排除
// - Knowledge.ai_usage_allowed = false → 排除
//
// 必选项（不可排除）：
// - 用户指令
// - 当前选区
// - 项目禁止规则

import type {
  ContextPack,
  ContextPreview,
  ContextEntry,
  ContextEntryKind,
  ContextScope,
  AgentTaskType,
  BoundObjectType,
  EntityId,
  Project,
  OutlineNode,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { NOT_FOUND, CONTEXT_EMPTY } from '@/constants/errors'
import { AGENT_MEMORY_KIND_LABEL } from '@/constants/status'
import { findProjectById } from '@/services/database/projectRepository'
import { listDocuments } from '@/services/database/documentRepository'
import { listSources } from '@/services/database/sourceRepository'
import { listCards } from '@/services/database/cardRepository'
import { listKnowledge } from '@/services/database/knowledgeRepository'
import { listOutlineNodesByProject } from '@/services/database/outlineRepository'
import {
  insertContextPack,
  findContextPackById,
} from '@/services/database/contextRepository'
import { generateId } from '@/services/database/mapping'
import { compactContext } from '@/services/context/ContextCompactor'
import { estimateTokens } from '@/utils/tokenEstimate'
import { recallMemories } from '@/services/agent/AgentMemoryService'
import {
  buildThreadStatePreview,
  getThreadState,
  updateThreadStateFromContext,
} from '@/services/agent/AgentThreadStateService'

// ============ 类型定义 ============

export type PreviewContextInput = {
  projectId: string
  threadId?: string
  taskType: AgentTaskType
  boundObjectType: BoundObjectType
  boundObjectId?: string
  contextScope?: ContextScope
  selectedText?: string
  userInstruction?: string
  /// 用户已排除的条目 refId 列表
  excludedRefIds?: string[]
  /// 模型上下文窗口大小（tokens），传入时触发自动压缩
  modelMaxTokens?: number
  /// 当前正在编辑的文档 ID（用于跨章节上下文关联）
  /// 当用户在文档编辑页打开 Agent 时传入，使 Agent 能看到当前文档完整内容 + 其他章节摘要
  currentDocumentId?: string
}

export type CreateContextPackInput = ContextPreview & {
  /// 用户确认创建快照
  userConfirmed?: boolean
}

// ============ 上下文策略配置 ============

/// 上下文范围类型
type ContextStrategyScope = 'minimal' | 'current_object' | 'related' | 'whole_project'

/// 上下文类型配置
type ContextTypeConfig = {
  /// 上下文类型
  type: ContextEntryKind
  /// 优先级（数字越小越高）
  priority: number
  /// 最大条数（null 表示不限制）
  maxCount?: number
  /// 最大 token（null 表示不限制）
  maxTokens?: number
  /// 是否必须（不可排除）
  required: boolean
  /// 截断长度（null 表示不截断）
  truncateLen?: number
}

/// 截断策略
type TruncatePolicy = {
  /// 选区文本截断长度
  selectedTextMaxLen?: number
  /// 文档截断长度
  documentMaxLen?: number
  /// 单条上下文截断长度
  entryMaxLen?: number
}

/// 任务上下文策略
type ContextStrategy = {
  /// 上下文范围
  scope: ContextStrategyScope
  /// 需要加载的上下文类型及其优先级
  contextTypes: ContextTypeConfig[]
  /// 截断策略
  truncate: TruncatePolicy
}

/// 各任务类型的上下文策略
const CONTEXT_STRATEGIES: Record<AgentTaskType, ContextStrategy> = {
  // 改写：最小化上下文，只保留指令、选区、风格规则
  rewrite: {
    scope: 'minimal',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
      { type: 'project_rules', priority: 3, required: true, truncateLen: 100 },
      { type: 'agent_memory', priority: 4, maxCount: 5, required: false, truncateLen: 200 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      entryMaxLen: 100,
    },
  },

  // 扩写：适度上下文，包含相关卡片/知识与当前大纲结构
  expand: {
    scope: 'related',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
      { type: 'project_rules', priority: 3, required: true, truncateLen: 200 },
      { type: 'agent_memory', priority: 4, maxCount: 5, required: false, truncateLen: 200 },
      { type: 'outline_node', priority: 5, maxCount: 15, required: false, truncateLen: 100 },
      { type: 'document', priority: 6, maxCount: 1, required: false, truncateLen: 2000 },
      { type: 'card', priority: 7, maxCount: 5, maxTokens: 2000, required: false, truncateLen: 300 },
      { type: 'knowledge', priority: 8, maxCount: 3, maxTokens: 1000, required: false, truncateLen: 300 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      documentMaxLen: 2000,
      entryMaxLen: 300,
    },
  },

  // 摘要：最小化上下文，只保留指令和选区
  summarize: {
    scope: 'minimal',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
    ],
    truncate: {
      selectedTextMaxLen: 5000,
      entryMaxLen: 200,
    },
  },

  // 检查来源：全项目搜索资料，同时携带大纲了解结构
  check_source: {
    scope: 'whole_project',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
      { type: 'project_rules', priority: 3, required: true, truncateLen: 150 },
      { type: 'agent_memory', priority: 4, maxCount: 5, required: false, truncateLen: 200 },
      { type: 'outline_node', priority: 5, maxCount: 15, required: false, truncateLen: 100 },
      { type: 'source', priority: 6, maxCount: 10, maxTokens: 5000, required: false, truncateLen: 500 },
      { type: 'card', priority: 7, maxCount: 10, maxTokens: 3000, required: false, truncateLen: 300 },
      { type: 'knowledge', priority: 8, maxCount: 5, maxTokens: 2000, required: false, truncateLen: 300 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      entryMaxLen: 500,
    },
  },

  // 生成大纲：全项目视角
  generate_outline: {
    scope: 'whole_project',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'project_rules', priority: 2, required: true, truncateLen: 300 },
      { type: 'agent_memory', priority: 3, maxCount: 5, required: false, truncateLen: 200 },
      { type: 'outline_node', priority: 4, maxCount: 20, required: false, truncateLen: 200 },
      { type: 'source', priority: 5, maxCount: 10, maxTokens: 3000, required: false, truncateLen: 300 },
      { type: 'card', priority: 6, maxCount: 10, maxTokens: 2000, required: false, truncateLen: 300 },
      { type: 'knowledge', priority: 7, maxCount: 5, maxTokens: 1500, required: false, truncateLen: 300 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      documentMaxLen: 1000,
      entryMaxLen: 300,
    },
  },

  // 生成卡片：提取结构化知识
  generate_card: {
    scope: 'related',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
      { type: 'document', priority: 3, maxCount: 1, required: false, truncateLen: 1000 },
      { type: 'card', priority: 4, maxCount: 3, maxTokens: 500, required: false, truncateLen: 200 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      documentMaxLen: 1000,
      entryMaxLen: 200,
    },
  },

  // 问答：适度上下文，默认携带项目大纲结构
  // 注意：knowledge 静态注入仅作基线（最近 2 条），详细知识由 Agent 通过
  // search_knowledge 工具按需检索（见 AgentService.sendMessage 工具调用循环）
  answer_question: {
    scope: 'related',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'agent_memory', priority: 2, maxCount: 5, required: false, truncateLen: 200 },
      { type: 'project_rules', priority: 3, required: false, truncateLen: 200 },
      { type: 'outline_node', priority: 4, maxCount: 15, required: false, truncateLen: 100 },
      { type: 'document', priority: 5, maxCount: 1, required: false, truncateLen: 1500 },
      { type: 'card', priority: 6, maxCount: 5, maxTokens: 2000, required: false, truncateLen: 400 },
      { type: 'knowledge', priority: 7, maxCount: 2, maxTokens: 800, required: false, truncateLen: 400 },
      { type: 'source', priority: 8, maxCount: 3, maxTokens: 1500, required: false, truncateLen: 400 },
    ],
    truncate: {
      entryMaxLen: 400,
    },
  },

  // 格式化：最小化上下文
  format_text: {
    scope: 'minimal',
    contextTypes: [
      { type: 'user_instruction', priority: 1, required: true },
      { type: 'selected_text', priority: 2, required: true },
      { type: 'project_rules', priority: 3, required: false, truncateLen: 100 },
    ],
    truncate: {
      selectedTextMaxLen: undefined,
      entryMaxLen: 100,
    },
  },
}

// ============ 内部工具 ============

/// 截断文本用于预览
function truncate(text: string, maxLen = 200): string {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.substring(0, maxLen) + '...'
}

/// 截断文本并重新估算 token
function truncateWithToken(text: string, maxLen: number): { text: string; tokens: number } {
  const truncated = truncate(text, maxLen)
  return { text: truncated, tokens: estimateTokens(truncated) }
}

/// 构造必选条目
function buildRequiredEntry(
  kind: ContextEntryKind,
  title: string,
  content: string,
  truncateLen?: number,
): ContextEntry {
  const { text, tokens } = truncateLen
    ? truncateWithToken(content, truncateLen)
    : { text: content, tokens: estimateTokens(content) }

  return {
    kind,
    refId: null,
    title,
    preview: text,
    tokenEstimate: tokens,
    required: true,
    excluded: false,
  }
}

/// 构造可选条目
function buildOptionalEntry(
  kind: ContextEntryKind,
  refId: string,
  title: string,
  content: string,
  truncateLen?: number,
  statusLabel?: string,
  required = false,
): ContextEntry {
  const { text, tokens } = truncateLen
    ? truncateWithToken(content, truncateLen)
    : { text: truncate(content, 300), tokens: estimateTokens(content) }

  return {
    kind,
    refId,
    title,
    preview: text,
    tokenEstimate: tokens,
    required,
    excluded: false,
    statusLabel,
  }
}

// ============ Service 方法 ============

/// 预览上下文
///
/// 根据任务类型策略组装上下文，优化 token 消耗。
/// 策略感知的上下文组装：轻量任务最小化上下文，重量任务最大化上下文。
export async function previewContext(
  input: PreviewContextInput,
): Promise<ServiceResult<ContextPreview>> {
  try {
    // 1. 获取任务对应的上下文策略
    const strategy = CONTEXT_STRATEGIES[input.taskType]
    if (!strategy) {
      return err({
        code: 'INVALID_TASK_TYPE',
        message: `不支持的任务类型: ${input.taskType}`,
        retryable: false,
      })
    }

    // 2. 查询项目
    const project = await findProjectById(input.projectId)
    if (!project) {
      return err({
        code: NOT_FOUND,
        message: '项目不存在',
        retryable: false,
      })
    }

    const excludedRefIds = new Set(input.excludedRefIds ?? [])

    // 3. 按策略优先级并行加载各类上下文
    //    每个策略类型独立加载到本地数组，避免共享状态竞争
    //    加载完成后按策略配置顺序合并，保证优先级正确
    const loadResults = await Promise.all(
      strategy.contextTypes.map((ctxType) =>
        loadContextByStrategy(ctxType, input, project, excludedRefIds, strategy),
      ),
    )
    const entries: ContextEntry[] = loadResults.flat()
    await appendThreadStateEntry(entries, input.threadId)

    // 4. 标记用户排除的条目（必选项不可排除）
    for (const entry of entries) {
      if (!entry.required && entry.refId && excludedRefIds.has(entry.refId)) {
        entry.excluded = true
      }
    }

    // 5. 应用 token 限制
    applyTokenLimit(entries, strategy.contextTypes)

    // 6. 若传入模型上限，应用自动压缩
    let compactionInfo: ContextPreview['compactionInfo'] = undefined
    if (input.modelMaxTokens && input.modelMaxTokens > 0) {
      // 构造优先级映射（从策略配置中提取）
      const priorityMap: Record<string, number> = {}
      for (const ctxType of strategy.contextTypes) {
        if (!priorityMap[ctxType.type]) {
          priorityMap[ctxType.type] = ctxType.priority
        }
      }

      const originalTokens = entries
        .filter((e) => !e.excluded)
        .reduce((sum, e) => sum + e.tokenEstimate, 0)

      const compactResult = compactContext(entries, input.modelMaxTokens, undefined, {
        priorityMap,
      })

      // 用压缩后的条目替换原条目
      entries.length = 0
      entries.push(...compactResult.entries)

      if (compactResult.compactedItems.length > 0) {
        compactionInfo = {
          originalTokens,
          compactedTokens: compactResult.totalTokens,
          compactedItems: compactResult.compactedItems,
        }
      }
    }

    // 7. 计算 token 估算（仅未排除的条目）
    const totalTokenEstimate = entries
      .filter((e) => !e.excluded)
      .reduce((sum, e) => sum + e.tokenEstimate, 0)

    // 8. 项目规则快照（用于系统提示词）
    const projectRulesSnapshot = {
      description: project.description,
      writingGoal: project.writingGoal,
      targetWordCount: project.targetWordCount,
      targetReader: project.targetReader,
      styleRules: project.styleRules,
      forbiddenRules: project.forbiddenRules,
    }

    const preview: ContextPreview = {
      projectId: project.id,
      threadId: input.threadId ?? null,
      taskType: input.taskType,
      userInstruction: input.userInstruction ?? null,
      selectedText: input.selectedText ?? null,
      currentDocumentId: input.currentDocumentId ?? null,
      boundObjectType: input.boundObjectType,
      boundObjectId: input.boundObjectId ?? null,
      contextScope: strategy.scope,
      entries,
      totalTokenEstimate,
      projectRulesSnapshot,
      compactionInfo,
    }

    return ok(preview)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 根据策略加载特定类型的上下文
///
/// 返回该类型对应的上下文条目数组（不修改外部状态，支持并行调用）
async function loadContextByStrategy(
  ctxType: ContextTypeConfig,
  input: PreviewContextInput,
  project: Project,
  _excludedRefIds: Set<string>,
  strategy: ContextStrategy,
): Promise<ContextEntry[]> {
  const entries: ContextEntry[] = []

  switch (ctxType.type) {
    case 'user_instruction':
      if (input.userInstruction && input.userInstruction.trim()) {
        entries.push(
          buildRequiredEntry(
            'user_instruction',
            '用户指令',
            input.userInstruction.trim(),
          ),
        )
      }
      break

    case 'selected_text':
      if (input.selectedText && input.selectedText.trim()) {
        const selectedText = input.selectedText.trim()
        // 应用截断策略
        const truncateLen = strategy.truncate.selectedTextMaxLen
        if (truncateLen && selectedText.length > truncateLen) {
          const truncated = selectedText.substring(0, truncateLen) + '...（已截断）'
          entries.push({
            kind: 'selected_text',
            refId: null,
            title: '当前选区（已截断）',
            preview: truncated,
            tokenEstimate: estimateTokens(truncated),
            required: true,
            excluded: false,
          })
        } else {
          entries.push(
            buildRequiredEntry('selected_text', '当前选区', selectedText),
          )
        }
      }
      break

    case 'project_rules':
      // 根据策略选择性加载项目规则
      loadProjectRules(entries, project, ctxType.truncateLen)
      break

    case 'document':
      if (strategy.scope === 'minimal') break // minimal 模式不加载文档
      await loadDocuments(entries, input, project, ctxType, strategy.truncate.documentMaxLen)
      break

    case 'source':
      if (strategy.scope === 'minimal') break
      await loadSources(entries, input, project, ctxType)
      break

    case 'card':
      if (strategy.scope === 'minimal') break
      await loadCards(entries, input, project, ctxType)
      break

    case 'knowledge':
      if (strategy.scope === 'minimal') break
      await loadKnowledge(entries, input, project, ctxType)
      break

    case 'outline_node':
      if (strategy.scope === 'minimal') break
      await loadOutlineNodes(entries, input, project, ctxType)
      break

    case 'agent_memory':
      await loadAgentMemories(entries, project.id, ctxType)
      break
  }

  return entries
}

/// 加载项目规则
function loadProjectRules(
  entries: ContextEntry[],
  project: Project,
  truncateLen?: number,
): void {
  if (project.description && project.description.trim()) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '项目概要',
        project.description.trim(),
        truncateLen,
      ),
    )
  }
  if (project.writingGoal && project.writingGoal.trim()) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '写作目标',
        project.writingGoal.trim(),
        truncateLen,
      ),
    )
  }
  if (project.targetWordCount && project.targetWordCount > 0) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '目标字数',
        `${project.targetWordCount} 字`,
        truncateLen,
      ),
    )
  }
  if (project.targetReader && project.targetReader.trim()) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '目标读者',
        project.targetReader.trim(),
        truncateLen,
      ),
    )
  }
  if (project.forbiddenRules && project.forbiddenRules.trim()) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '项目禁止规则',
        project.forbiddenRules.trim(),
        truncateLen,
      ),
    )
  }
  if (project.styleRules && project.styleRules.trim()) {
    entries.push(
      buildRequiredEntry(
        'project_rules',
        '项目风格规则',
        project.styleRules.trim(),
        truncateLen,
      ),
    )
  }
}

/// 加载文档
///
/// 跨章节上下文关联策略：
/// - 当存在 currentDocumentId 或绑定文档时，加载该文档完整内容（受 truncateLen 限制）
/// - 同时加载同项目其他文档的摘要（summary 或 plainText 前 300 字），标记为"其他章节"
/// - 摘要条目不受 maxCount 限制（轻量），最多 10 个，使 Agent 能了解全书/全文结构
/// - 无当前文档时，按 maxCount 加载完整文档（保持原有行为）
async function loadDocuments(
  entries: ContextEntry[],
  input: PreviewContextInput,
  project: Project,
  ctxType: ContextTypeConfig,
  documentTruncateLen?: number,
): Promise<void> {
  const docs = await listDocuments(project.id)
  // 优先使用 currentDocumentId，其次使用绑定文档
  const targetDocId = input.currentDocumentId
    ?? (input.boundObjectType === 'document' ? input.boundObjectId : null)

  // 优先加载当前文档完整内容 + 其他章节摘要
  if (targetDocId) {
    const doc = docs.find((d) => d.id === targetDocId)
    if (doc) {
      entries.push(
        buildOptionalEntry(
          'document',
          doc.id,
          doc.title,
          doc.plainText ?? '',
          ctxType.truncateLen ?? documentTruncateLen,
          '当前文档',
        ),
      )

      // 加载其他章节摘要（跨章节上下文关联，轻量摘要不受 maxCount 限制）
      const otherDocs = docs.filter((d) => d.id !== targetDocId)
      const MAX_SUMMARIES = 10
      const SUMMARY_LEN = 300
      let summaryCount = 0
      for (const otherDoc of otherDocs) {
        if (summaryCount >= MAX_SUMMARIES) break
        // 摘要优先用 summary，其次用 plainText 前 300 字
        const summaryText =
          otherDoc.summary?.trim() ||
          (otherDoc.plainText ? otherDoc.plainText.slice(0, SUMMARY_LEN) : '')
        if (!summaryText.trim()) continue
        entries.push(
          buildOptionalEntry(
            'document',
            otherDoc.id,
            otherDoc.title,
            summaryText,
            SUMMARY_LEN,
            '其他章节',
          ),
        )
        summaryCount++
      }
      return
    }
  }

  // 无当前文档：按 maxCount 加载完整文档（保持原有行为）
  let count = 0
  for (const doc of docs) {
    if (doc.id === targetDocId) continue
    if (ctxType.maxCount && count >= ctxType.maxCount) break
    entries.push(
      buildOptionalEntry(
        'document',
        doc.id,
        doc.title,
        doc.plainText ?? '',
        ctxType.truncateLen ?? documentTruncateLen,
      ),
    )
    count++
  }
}

/// 加载资料
async function loadSources(
  entries: ContextEntry[],
  input: PreviewContextInput,
  project: Project,
  ctxType: ContextTypeConfig,
): Promise<void> {
  const sources = await listSources(project.id)

  let count = 0
  for (const source of sources) {
    // 排除 ai_usage_allowed = false
    if (!source.aiUsageAllowed) continue
    // 排除当前绑定对象
    if (input.boundObjectType === 'source' && source.id === input.boundObjectId) continue
    if (ctxType.maxCount && count >= ctxType.maxCount) break

    const sourceText = source.summaryShort ?? source.rawText ?? ''
    if (!sourceText.trim()) continue

    entries.push(
      buildOptionalEntry(
        'source',
        source.id,
        source.title,
        sourceText,
        ctxType.truncateLen,
        source.processingStatus === 'ready' ? '已解析' : '解析中',
      ),
    )
    count++
  }
}

/// 加载卡片
async function loadCards(
  entries: ContextEntry[],
  input: PreviewContextInput,
  project: Project,
  ctxType: ContextTypeConfig,
): Promise<void> {
  const cards = await listCards(project.id)

  let count = 0
  for (const card of cards) {
    // 排除规则
    if (card.status === 'deprecated') continue
    if (!card.aiUsageAllowed) continue
    // 排除当前绑定对象
    if (input.boundObjectType === 'card' && card.id === input.boundObjectId) continue
    if (ctxType.maxCount && count >= ctxType.maxCount) break

    entries.push(
      buildOptionalEntry(
        'card',
        card.id,
        card.title,
        card.content,
        ctxType.truncateLen,
        card.status === 'confirmed' ? '已确认' : '待确认',
      ),
    )
    count++
  }
}

/// 加载知识
async function loadKnowledge(
  entries: ContextEntry[],
  input: PreviewContextInput,
  project: Project,
  ctxType: ContextTypeConfig,
): Promise<void> {
  const knowledgeItems = await listKnowledge(project.id)

  let count = 0
  for (const knowledge of knowledgeItems) {
    // 排除规则
    if (knowledge.status === 'deprecated') continue
    if (knowledge.status === 'forbidden') continue
    if (!knowledge.aiUsageAllowed) continue
    // 排除当前绑定对象
    if (input.boundObjectType === 'knowledge' && knowledge.id === input.boundObjectId) continue
    if (ctxType.maxCount && count >= ctxType.maxCount) break

    entries.push(
      buildOptionalEntry(
        'knowledge',
        knowledge.id,
        knowledge.title,
        knowledge.content,
        ctxType.truncateLen,
        knowledge.status === 'confirmed' ? '已确认' : '待确认',
      ),
    )
    count++
  }
}

/// 加载大纲节点
///
/// 将节点按层级路径组织（如 "卷一 > 第一章 > 第一节"），便于 Agent 理解整体结构。
async function loadOutlineNodes(
  entries: ContextEntry[],
  input: PreviewContextInput,
  project: Project,
  ctxType: ContextTypeConfig,
): Promise<void> {
  const nodes = await listOutlineNodesByProject(project.id)
  if (nodes.length === 0) return

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  /// 根据 parentId 向上回溯构造层级路径
  function buildPath(node: OutlineNode): string {
    const parts: string[] = [node.title]
    let parentId = node.parentId
    while (parentId) {
      const parent = nodeMap.get(parentId)
      if (!parent) break
      parts.unshift(parent.title)
      parentId = parent.parentId
    }
    return parts.join(' > ')
  }

  let count = 0
  for (const node of nodes) {
    // 排除当前绑定对象
    if (input.boundObjectType === 'outline_node' && node.id === input.boundObjectId) continue
    if (ctxType.maxCount && count >= ctxType.maxCount) break

    const path = buildPath(node)
    const description = node.description?.trim() ?? ''
    const content = description ? `${path}\n${description}` : path

    entries.push(
      buildOptionalEntry(
        'outline_node',
        node.id,
        path,
        content,
        ctxType.truncateLen,
        node.status === 'completed' ? '已完成' : '进行中',
      ),
    )
    count++
  }
}

/// 加载 Agent 长期记忆
///
/// 从项目级记忆中召回高置信度条目，作为上下文注入。
/// 记忆是跨会话共享的，用于保持多轮对话的一致性。
async function loadAgentMemories(
  entries: ContextEntry[],
  projectId: EntityId,
  ctxType: ContextTypeConfig,
): Promise<void> {
  const recallLimit = ctxType.maxCount ?? 5
  const result = await recallMemories(projectId, recallLimit)
  if (!result.ok) return

  for (const memory of result.data) {
    const label = AGENT_MEMORY_KIND_LABEL[memory.kind] ?? '记忆'
    entries.push(
      buildOptionalEntry(
        'agent_memory',
        memory.id,
        `${label}（置信度 ${Math.round(memory.confidence * 100)}%）`,
        memory.content,
        ctxType.truncateLen,
      ),
    )
  }
}

/// 应用 token 限制
function applyTokenLimit(
  entries: ContextEntry[],
  contextTypes: ContextTypeConfig[],
): void {
  // 计算每个类型的 token 配额
  const typeBudgets = new Map<ContextEntryKind, number>()
  for (const ctxType of contextTypes) {
    if (ctxType.maxTokens) {
      typeBudgets.set(ctxType.type, ctxType.maxTokens)
    }
  }

  // 对每个类型按优先级截断（只截断非必选项）
  for (const ctxType of contextTypes) {
    if (!ctxType.maxTokens) continue

    const budget = ctxType.maxTokens
    const typeEntries = entries.filter(
      (e) => e.kind === ctxType.type && !e.excluded && !e.required,
    )
    let currentTokens = 0

    for (const entry of typeEntries) {
      if (currentTokens + entry.tokenEstimate > budget) {
        entry.excluded = true
      } else {
        currentTokens += entry.tokenEstimate
      }
    }
  }
}

/// 创建 ContextPack 快照
///
/// 将预览结果（排除已排除条目）保存为不可变快照。
export async function createContextPack(
  input: CreateContextPackInput,
): Promise<ServiceResult<ContextPack>> {
  try {
    // 过滤掉已排除的条目
    const activeEntries = input.entries.filter((e) => !e.excluded)

    if (activeEntries.length === 0) {
      return err({
        code: CONTEXT_EMPTY,
        message: '当前没有可用参考内容',
        retryable: false,
      })
    }

    // 基于实际活跃条目重新计算 token 估算
    // 避免用户手动排除后 tokenEstimate 与实际不一致
    const tokenEstimate = activeEntries.reduce((sum, e) => sum + e.tokenEstimate, 0)

    const packId = generateId()

    // 提取各类 ID
    const documentIds = extractIds(activeEntries, 'document')
    const sourceIds = extractIds(activeEntries, 'source')
    const sourceChunkIds = extractIds(activeEntries, 'source_chunk')
    const cardIds = extractIds(activeEntries, 'card')
    const knowledgeIds = extractIds(activeEntries, 'knowledge')
    const outlineNodeIds = extractIds(activeEntries, 'outline_node')
    const previousMessageIds = extractIds(activeEntries, 'previous_message')

    // 构造上下文摘要
    const contextSummary = activeEntries
      .map((e) => `[${e.title}] ${truncate(e.preview, 80)}`)
      .join('\n')

    await insertContextPack({
      id: packId,
      projectId: input.projectId,
      threadId: input.threadId,
      taskType: input.taskType,
      userInstruction: input.userInstruction,
      contextScope: input.contextScope,
      selectedText: input.selectedText,
      documentIds,
      sourceIds,
      sourceChunkIds,
      cardIds,
      knowledgeIds,
      outlineNodeIds,
      previousMessageIds,
      projectRulesSnapshot: input.projectRulesSnapshot,
      contextSummary,
      tokenEstimate,
      entries: activeEntries,
    })

    if (input.threadId) {
      const stateResult = await updateThreadStateFromContext({
        projectId: input.projectId,
        threadId: input.threadId,
        contextPackId: packId,
        taskType: input.taskType,
        userInstruction: input.userInstruction,
        selectedText: input.selectedText,
        boundObjectType: input.boundObjectType,
        boundObjectId: input.boundObjectId,
        currentDocumentId: input.currentDocumentId,
      })
      if (!stateResult.ok) {
        return err(stateResult.error)
      }
    }

    const pack = await findContextPackById(packId)
    if (!pack) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: 'ContextPack 创建后查询失败',
        retryable: true,
      })
    }

    return ok(pack)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询 ContextPack 详情
export async function getContextPack(
  packId: string,
): Promise<ServiceResult<ContextPack>> {
  try {
    const pack = await findContextPackById(packId)
    if (!pack) {
      return err({
        code: NOT_FOUND,
        message: 'ContextPack 不存在',
        retryable: false,
      })
    }
    return ok(pack)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 导出工具（供 AgentService 压缩时使用） ============

/// 从条目列表生成上下文摘要字符串
///
/// 与 createContextPack 内部逻辑一致，供 AgentService 压缩后重建 contextSummary 使用
export function buildContextSummary(entries: ContextEntry[]): string {
  return entries
    .filter((e) => !e.excluded)
    .map((e) => `[${e.title}] ${e.preview}`)
    .join('\n')
}

/// 获取任务类型的上下文优先级映射
///
/// 供 AgentService.sendMessage 调用 compactContext 时传入 priorityMap，
/// 确保压缩策略与预览阶段一致
export function getTaskPriorityMap(taskType: AgentTaskType): Record<string, number> {
  const strategy = CONTEXT_STRATEGIES[taskType]
  if (!strategy) return {}
  const priorityMap: Record<string, number> = {}
  for (const ctxType of strategy.contextTypes) {
    if (!priorityMap[ctxType.type]) {
      priorityMap[ctxType.type] = ctxType.priority
    }
  }
  return priorityMap
}

// ============ 内部：上下文组装 ============

async function appendThreadStateEntry(
  entries: ContextEntry[],
  threadId?: EntityId,
): Promise<void> {
  if (!threadId) return

  const result = await getThreadState(threadId)
  if (!result.ok || !result.data) return

  const preview = buildThreadStatePreview(result.data)
  if (!preview.trim()) return

  entries.push({
    kind: 'agent_thread_state',
    refId: result.data.id,
    title: '多轮工作状态',
    preview,
    tokenEstimate: estimateTokens(preview),
    required: true,
    excluded: false,
  })
}

/// 提取指定类型的 ID 列表
function extractIds(
  entries: ContextEntry[],
  kind: ContextEntryKind,
): EntityId[] {
  return entries
    .filter((e) => e.kind === kind && e.refId)
    .map((e) => e.refId!) as EntityId[]
}
