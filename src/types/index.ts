// 核心数据对象类型定义
// 对应数据库表结构，所有 Service / Repository / UI 共用
// 命名保持英文（研发映射），UI 显示中文通过 objectLabels 映射

// ============ 通用类型 ============

/// 通用 ISO 时间戳字符串
export type ISODateString = string

/// 通用 ID 类型（UUID 或自定义字符串）
export type EntityId = string

// ============ 用户与工作空间 ============

export interface User {
  id: EntityId
  displayName: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface Workspace {
  id: EntityId
  name: string
  createdBy: EntityId
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 项目 ============

export type ProjectType = 'research' | 'fiction' | 'free_writing'
export type ProjectStatus =
  | 'draft'
  | 'writing'
  | 'revising'
  | 'ready_to_export'
  | 'completed'
  | 'archived'

export interface Project {
  id: EntityId
  workspaceId: EntityId
  name: string
  type: ProjectType
  description: string | null
  writingGoal: string | null
  targetReader: string | null
  targetWordCount: number
  currentWordCount: number
  language: string
  styleRules: string | null
  forbiddenRules: string | null
  status: ProjectStatus
  createdBy: EntityId
  updatedBy: EntityId | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 文档 ============

export type DocumentType = 'normal' | 'chapter' | 'note'
export type DocumentStatus =
  | 'draft'
  | 'writing'
  | 'reviewing'
  | 'completed'
  | 'archived'

export interface Document {
  id: EntityId
  projectId: EntityId
  title: string
  type: DocumentType
  contentJson: unknown | null
  plainText: string
  wordCount: number
  outlineNodeId: EntityId | null
  status: DocumentStatus
  summary: string | null
  lastEditedAt: ISODateString | null
  /// 论文引用格式(MVP 仅实现 gbt7714_2015,其余预留)
  citationStyle: CitationStyle
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 资料库 ============

export type SourceType =
  | 'pdf'
  | 'word'
  | 'markdown'
  | 'txt'
  | 'text'
  | 'web'
  | 'other'

export type SourceProcessingStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'summarizing'
  | 'ready'
  | 'failed'

export type SourceStatus = 'active' | 'archived'
export type PrivacyLevel = 'local_only' | 'cloud_allowed'

export interface Source {
  id: EntityId
  projectId: EntityId
  title: string
  type: SourceType
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  rawText: string | null
  summaryShort: string | null
  summaryLong: string | null
  keywords: string[] | null
  aiUsageAllowed: boolean
  privacyLevel: PrivacyLevel
  processingStatus: SourceProcessingStatus
  sourceStatus: SourceStatus
  errorMessage: string | null
  /// 书目元数据(材料真实性基础,用于从资料生成参考文献)
  bibliographicMetadata: BibliographicMetadata | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface SourceChunk {
  id: EntityId
  projectId: EntityId
  sourceId: EntityId
  chunkIndex: number
  content: string
  tokenCount: number
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
  embeddingId: string | null
  createdAt: ISODateString
}

// ============ 资料解析结果(Rust 端 parse_source_file 命令返回) ============

/// 资料解析后的分片(Rust 端返回,与 SourceChunk 不同:无 id/projectId/sourceId 等数据库字段)
export interface ParsedChunk {
  /// 分片文本内容
  content: string
  /// 页码(PDF 从 1 开始,Word 为 null)
  pageNumber: number | null
  /// 在全文中的起始偏移(字符偏移)
  startOffset: number | null
  /// 在全文中的结束偏移
  endOffset: number | null
}

/// 资料解析结果(对应 Rust 端 ParsedSource)
export interface ParsedSource {
  /// 全文文本(写入 sources.raw_text)
  text: string
  /// 总页数(PDF 按分页符统计,Word 固定为 1)
  pageCount: number
  /// 按页/段落切分的分片(写入 source_chunks 表)
  chunks: ParsedChunk[]
  /// 资料类型('pdf' | 'word')
  sourceType: 'pdf' | 'word'
  /// 是否使用了 OCR(扫描版 PDF 自动回退时为 true)
  ocrUsed: boolean
}

// ============ 卡片 ============

export type CardStatus =
  | 'pending'
  | 'confirmed'
  | 'deprecated'
  | 'conflict'
  | 'forbidden'

export interface Card {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  content: string
  summary: string | null
  status: CardStatus
  tags: string[] | null
  sourceId: EntityId | null
  sourceChunkId: EntityId | null
  sourceDocumentId: EntityId | null
  sourceAgentMessageId: EntityId | null
  aiUsageAllowed: boolean
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 大纲 ============

export interface Outline {
  id: EntityId
  projectId: EntityId
  title: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export type OutlineNodeStatus = 'draft' | 'writing' | 'completed' | 'archived'

export interface OutlineNode {
  id: EntityId
  projectId: EntityId
  outlineId: EntityId
  parentId: EntityId | null
  title: string
  description: string | null
  status: OutlineNodeStatus
  sortOrder: number
  depth: number
  linkedDocumentId: EntityId | null
  targetWordCount: number
  currentWordCount: number
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 知识库 ============

export type KnowledgeStatus =
  | 'pending'
  | 'confirmed'
  | 'deprecated'
  | 'conflict'
  | 'forbidden'

export interface Knowledge {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  content: string
  summary: string | null
  status: KnowledgeStatus
  sourceType: string | null
  sourceId: EntityId | null
  aiUsageAllowed: boolean
  confidence: number | null
  version: number
  replacedById: EntityId | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ Agent ============

export type AgentRole =
  | 'research_assistant'
  | 'source_assistant'
  | 'outline_assistant'
  | 'writing_assistant'
  | 'card_assistant'
  | 'knowledge_assistant'
  | 'format_assistant'

export type AgentTaskType =
  | 'rewrite'
  | 'expand'
  | 'summarize'
  | 'check_source'
  | 'generate_outline'
  | 'generate_card'
  | 'answer_question'
  | 'format_text'

export type BoundObjectType =
  | 'document'
  | 'source'
  | 'card'
  | 'outline_node'
  | 'knowledge'
  | 'project'

export type ContextScope =
  | 'minimal'
  | 'current_object'
  | 'related'
  | 'whole_project'
  | 'custom'

export interface AgentThread {
  id: EntityId
  projectId: EntityId
  title: string
  agentRole: AgentRole
  boundObjectType: BoundObjectType
  boundObjectId: EntityId | null
  contextScope: ContextScope
  threadSummary: string | null
  status: 'active' | 'archived'
  messageCount: number
  lastMessageAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

export type MessageRole = 'user' | 'assistant' | 'system'
export type AdoptionStatus =
  | 'not_applied'
  | 'applied'
  | 'rejected'
  | 'saved_as_card'
  | 'saved_as_knowledge'

/// Agent 解释结构：对应 "为什么这样建议"
export interface AgentExplanation {
  taskUnderstanding: string
  referencedContext: string[]
  mainJudgements: string[]
  revisionReasons: string[]
  uncertainties: string[]
}

export type AgentIntentKind =
  | 'write_document_body'
  | 'continue_document'
  | 'rewrite_document'
  | 'polish_document'
  | 'create_outline'
  | 'answer_question'
  | 'manage_card'
  | 'manage_knowledge'
  | 'clarify'

export interface AgentPlan {
  intentKind: AgentIntentKind
  targetObjectType: BoundObjectType
  targetObjectId?: EntityId
  requiredTools: string[]
  allowedTools: string[]
  riskLevel: 'low' | 'medium' | 'high'
  clarificationRequired: boolean
  steps: string[]
}

export interface AgentMessage {
  id: EntityId
  threadId: EntityId
  projectId: EntityId
  role: MessageRole
  content: string
  structuredOutput: unknown | null
  explanation: AgentExplanation | null
  contextPackId: EntityId | null
  agentRunId: EntityId | null
  adoptionStatus: AdoptionStatus
  savedAsCardId: EntityId | null
  savedAsKnowledgeId: EntityId | null
  createdAt: ISODateString
}

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface AgentRun {
  id: EntityId
  projectId: EntityId
  threadId: EntityId
  contextPackId: EntityId
  modelConfigId: EntityId | null
  modelName: string | null
  status: AgentRunStatus
  inputTokens: number
  outputTokens: number
  errorCode: string | null
  errorMessage: string | null
  startedAt: ISODateString | null
  completedAt: ISODateString | null
  createdAt: ISODateString
}

// ============ AgentMemory ============

/// 记忆类型
export type AgentMemoryKind =
  | 'preference' // 用户偏好（如风格、语气）
  | 'fact'        // 事实信息（如角色设定、世界观）
  | 'decision'    // 关键决策（如情节走向）
  | 'style'       // 写作风格
  | 'summary'     // 对话摘要

/// Agent 长期记忆
///
/// 跨会话共享，从对话中自动提取或用户手动添加。
/// 在创建 ContextPack 时按项目召回，作为上下文条目注入。
export interface AgentMemory {
  id: EntityId
  projectId: EntityId
  /// 来源线程（自动提取时有值，手动添加时为 null）
  sourceThreadId: EntityId | null
  kind: AgentMemoryKind
  content: string
  /// 置信度 0-1，自动提取的初始值较低，用户确认后提高
  confidence: number
  createdAt: ISODateString
  updatedAt: ISODateString
}

/// Agent 线程工作状态
///
/// 记录多轮对话中跨回合复用的任务目标、约束和采纳/拒绝历史。
export interface AgentThreadState {
  id: EntityId
  projectId: EntityId
  threadId: EntityId
  currentGoal: string | null
  currentStep: string | null
  userConstraints: string[]
  acceptedDecisions: string[]
  rejectedDirections: string[]
  activeDocumentId: EntityId | null
  activeOutlineNodeId: EntityId | null
  lastContextPackId: EntityId | null
  unresolvedQuestions: string[]
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ ContextPack ============

export interface ContextPack {
  id: EntityId
  projectId: EntityId
  threadId: EntityId | null
  taskType: AgentTaskType
  userInstruction: string | null
  contextScope: ContextScope
  selectedText: string | null
  documentIds: EntityId[]
  sourceIds: EntityId[]
  sourceChunkIds: EntityId[]
  cardIds: EntityId[]
  knowledgeIds: EntityId[]
  outlineNodeIds: EntityId[]
  previousMessageIds: EntityId[]
  projectRulesSnapshot: unknown | null
  contextSummary: string | null
  tokenEstimate: number
  /// 完整的上下文条目列表（JSON 存储，用于 sendMessage 失败后结构化压缩）
  entries: ContextEntry[]
  createdAt: ISODateString
}

// ============ 模型 ============

export type ProviderType = 'openai_compatible'
export type ConnectionStatus = 'untested' | 'connected' | 'failed'

/// 模型能力信息（来自 /v1/models 端点或内置 fallback 表）
export interface ModelInfo {
  /// 模型 ID（如 'deepseek-chat'）
  id: string
  /// 上下文窗口大小（tokens），未知时为 null
  contextLength: number | null
  /// 最大输出 tokens，未知时为 null
  maxOutputTokens: number | null
}

export interface ModelProvider {
  id: EntityId
  workspaceId: EntityId
  name: string
  type: ProviderType
  baseUrl: string
  apiKeyEncrypted: string | null
  apiKeyMasked: string | null
  defaultModelName: string
  /// 默认模型的上下文窗口大小（tokens），用于上下文压缩判断
  defaultModelContextLength: number | null
  connectionStatus: ConnectionStatus
  enabled: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

export type ModelTaskType =
  | 'chat'
  | 'rewrite'
  | 'expand'
  | 'summarize'
  | 'generate_outline'
  | 'parse_source'
  | 'generate_card'

export interface ModelConfig {
  id: EntityId
  workspaceId: EntityId
  providerId: EntityId
  taskType: ModelTaskType
  modelName: string
  temperature: number
  maxOutputTokens: number
  enabled: boolean
  createdAt: ISODateString
  updatedAt: ISODateString
}

// ============ 模型调用 ============

import type { ToolCall } from './tool'

/// 模型消息角色（OpenAI-compatible chat messages）
export type ModelMessageRole = 'system' | 'user' | 'assistant' | 'tool'

/// 模型调用入参消息
///
/// 扩展字段用于支持 Tool Use：
/// - role='assistant' 且模型发起工具调用时，携带 `toolCalls`
/// - role='tool' 时携带 `toolCallId` 标识对应的工具调用
export interface ModelMessage {
  role: ModelMessageRole
  content: string
  /// role='tool' 时必填，对应工具调用 ID
  toolCallId?: string
  /// role='assistant' 且模型发起工具调用时携带
  toolCalls?: ToolCall[]
}

/// 模型调用结果
export interface ModelResult {
  content: string
  /// 模型请求的工具调用（若模型决定调用工具）
  toolCalls?: ToolCall[]
  modelName: string
  inputTokens: number
  outputTokens: number
  /// 模型停止原因，例如 'stop' / 'length' / 'tool_calls'
  finishReason?: string
  raw?: unknown
}

// ============ ContextPack 预览 ============

/// 上下文条目类型
export type ContextEntryKind =
  | 'user_instruction'
  | 'selected_text'
  | 'project_rules'
  | 'document'
  | 'source'
  | 'source_chunk'
  | 'card'
  | 'knowledge'
  | 'outline_node'
  | 'previous_message'
  | 'agent_memory'
  | 'agent_thread_state'

/// 上下文条目（预览用）
export interface ContextEntry {
  kind: ContextEntryKind
  /// 关联对象 ID（项目规则/选区/指令可为 null）
  refId: EntityId | null
  /// 标题（用于 UI 显示）
  title: string
  /// 内容预览（截断后的文本）
  preview: string
  /// 估算 token 数
  tokenEstimate: number
  /// 是否必选（不可排除）
  required: boolean
  /// 是否已被用户排除
  excluded: boolean
  /// 来源对象状态标记（如「待确认」「已确认」）
  statusLabel?: string
}

/// ContextPack 预览结果
export interface ContextPreview {
  projectId: EntityId
  threadId: EntityId | null
  taskType: AgentTaskType
  userInstruction: string | null
  selectedText: string | null
  currentDocumentId?: EntityId | null
  boundObjectType: BoundObjectType
  boundObjectId: EntityId | null
  contextScope: ContextScope
  entries: ContextEntry[]
  totalTokenEstimate: number
  /// 项目规则快照（必选项，不可排除）
  projectRulesSnapshot: {
    description: string | null
    writingGoal: string | null
    targetWordCount: number
    targetReader: string | null
    styleRules: string | null
    forbiddenRules: string | null
  } | null
  /// 上下文压缩信息（若发生自动压缩）
  compactionInfo?: {
    /// 压缩前 token 数
    originalTokens: number
    /// 压缩后 token 数
    compactedTokens: number
    /// 被压缩/裁剪的条目信息
    compactedItems: Array<{
      title: string
      action: 'truncated' | 'excluded'
      originalTokens: number
      newTokens: number
    }>
  }
}

// ============ 导出 ============

export type ExportScope = 'whole_project' | 'current_document' | 'outline_scope'
export type ExportFormat = 'markdown' | 'txt' | 'word' | 'latex' | 'docx'
export type ExportTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/// 导出高级选项(论文格式/字体/字号/行距/页边距/是否含图表目录等)
export interface ExportOptions {
  template?: string
  citationStyle?: CitationStyle
  includeFigures: boolean
  includeTOC: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  margin: { top: number; bottom: number; left: number; right: number }
}

export interface ExportTask {
  id: EntityId
  projectId: EntityId
  exportScope: ExportScope
  exportFormat: ExportFormat
  documentIds: EntityId[] | null
  outlineNodeIds: EntityId[] | null
  /// 导出高级选项(JSON 存储)
  exportOptions: ExportOptions | null
  filePath: string | null
  status: ExportTaskStatus
  errorCode: string | null
  errorMessage: string | null
  createdAt: ISODateString
  completedAt: ISODateString | null
}

// ============ 任务 ============

export type TaskType =
  | 'parse_source'
  | 'summarize_source'
  | 'agent_run'
  | 'generate_outline'
  | 'export_document'
  | 'build_search_index'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface Task {
  id: EntityId
  projectId: EntityId | null
  taskType: TaskType
  objectType: string | null
  objectId: EntityId | null
  status: TaskStatus
  progress: number
  errorCode: string | null
  errorMessage: string | null
  payload: unknown | null
  result: unknown | null
  startedAt: ISODateString | null
  completedAt: ISODateString | null
  createdAt: ISODateString
}

// ============ 操作日志 ============

export interface OperationLog {
  id: EntityId
  projectId: EntityId | null
  objectType: string | null
  objectId: EntityId | null
  action: string
  detail: string | null
  createdAt: ISODateString
}

// ============ 论文写作扩展 ============

/// 引用格式(MVP 仅实现 gbt7714_2015,其余预留)
export type CitationStyle = 'gbt7714_2015' | 'apa7' | 'ieee' | 'mla9'

/// 参考文献条目类型(对应 GB/T 7714 文献类型标识)
export type ReferenceEntryType = 'journal' | 'book' | 'conference' | 'thesis' | 'web' | 'other'

/// 引文标注格式
export type CitationFormat = 'numeric' | 'author_year'

/// 图表类型(figure=图片,table=表格)
export type FigureKind = 'figure' | 'table'

/// 作者信息
export interface AuthorInfo {
  name: string
  affiliation?: string
}

/// 书目元数据(资料导入时提取,用于生成参考文献)
export interface BibliographicMetadata {
  authors: AuthorInfo[]
  year: number | null
  title: string
  /// 期刊名/书名/会议名
  container: string | null
  entryType: ReferenceEntryType
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  city: string | null
  doi: string | null
  isbn: string | null
  url: string | null
  accessDate: ISODateString | null
}

/// 参考文献库条目(项目级,可被多个文档引用)
export interface Reference {
  id: EntityId
  projectId: EntityId
  /// 关联本地导入的资料(材料真实性保障,可空表示手动录入)
  sourceId: EntityId | null
  /// BibTeX 风格 key,项目内唯一
  citationKey: string
  entryType: ReferenceEntryType
  title: string
  authors: AuthorInfo[]
  year: number | null
  /// 期刊名/书名/会议名
  container: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  city: string | null
  doi: string | null
  isbn: string | null
  url: string | null
  accessDate: ISODateString | null
  /// 原始书目 JSON(导入时保留,便于回溯)
  rawMetadata: BibliographicMetadata | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

/// 引文实例(文档内每一次引用行为)
export interface Citation {
  id: EntityId
  projectId: EntityId
  documentId: EntityId
  referenceId: EntityId
  citationFormat: CitationFormat
  /// 页码/章节定位,如 'p.123' 或 'ch.4'
  locator: string | null
  /// 引文前缀,如 '见'
  prefix: string | null
  /// 引文后缀,如 '第2版'
  suffix: string | null
  /// 解析后的行内显示文本,如 '[1]' 或 '(Smith, 2020)'
  inlineText: string
  /// TipTap 文档位置(便于回溯定位)
  prosemirrorPos: number | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

/// 图表(figure/table 统一管理,通过 kind 区分)
export interface Figure {
  id: EntityId
  projectId: EntityId
  documentId: EntityId
  kind: FigureKind
  /// 自动编号(figure 与 table 各自独立序列)
  number: number | null
  /// 用户可指定 label,如 'fig:architecture'
  label: string | null
  /// 题注(必填)
  caption: string
  /// 注释(可选)
  note: string | null
  /// 来源资料(材料真实性,可空)
  sourceId: EntityId | null
  /// 图片本地路径(figure)
  imagePath: string | null
  /// base64 内联(MVP 简化,小图)
  imageData: string | null
  /// 表格 TipTap JSON(table)
  tableData: unknown | null
  prosemirrorPos: number | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

/// 块级公式(行内公式不入库,直接在 TipTap JSON 中)
export interface Equation {
  id: EntityId
  projectId: EntityId
  documentId: EntityId
  /// 自动编号(公式 1,2,3...)
  number: number | null
  /// 用户指定 label,如 'eq:euler'
  label: string | null
  /// LaTeX 源码
  latex: string
  prosemirrorPos: number | null
  isDeleted: boolean
  deletedAt: ISODateString | null
  createdAt: ISODateString
  updatedAt: ISODateString
}

/// 交叉引用目标类型
export type CrossReferenceTargetType = 'figure' | 'table' | 'equation' | 'section'

/// 文档完整性问题类型
export type IntegrityIssueType =
  | 'orphan_citation'        // 悬空引文(citation 引用了不存在的 reference)
  | 'orphan_cross_ref'       // 悬空交叉引用
  | 'missing_caption'        // 图表缺失题注
  | 'missing_source'         // 图表缺失来源(警告级)
  | 'number_conflict'        // 编号冲突
  | 'label_duplicate'        // label 重复
  | 'invalid_latex'          // 公式 LaTeX 语法错误

/// 文档完整性问题
export interface IntegrityIssue {
  type: IntegrityIssueType
  /// 问题对象的 ID(figureId/equationId/citationId 等)
  objectId: EntityId | null
  /// 问题描述
  description: string
  /// 建议修复动作
  suggestedAction: string | null
}

/// 拼写检查问题类型
export type SpellCheckIssueKind =
  | 'typo'      // 错别字
  | 'grammar'   // 语法/语病
  | 'usage'     // 用词不当

/// 拼写检查问题
export interface SpellCheckIssue {
  /// 错误类型
  kind: SpellCheckIssueKind
  /// 原文片段（包含问题的上下文，便于定位）
  original: string
  /// 问题描述
  description: string
  /// 建议修改后的文本
  suggestion: string | null
}

/// 文档论文元数据(聚合统计)
export interface DocumentPaperMeta {
  documentId: EntityId
  citationCount: number
  figureCount: number
  tableCount: number
  equationCount: number
  wordCount: number
  /// 完整性问题列表
  issues: IntegrityIssue[]
}

// ============ 工具调用（Tool Use） ============

export * from './tool'
export * from './pendingAction'
