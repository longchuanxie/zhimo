// 状态枚举与中文映射
// 集中维护所有业务状态的中文显示
// 对应文档：02_UX_UI_原型与规范/04_中文优先UI规范_v0.1.md

import type {
  ProjectStatus,
  ProjectType,
  DocumentStatus,
  SourceProcessingStatus,
  SourceStatus,
  CardStatus,
  KnowledgeStatus,
  AgentRunStatus,
  ExportTaskStatus,
  TaskStatus,
  AgentRole,
  OutlineNodeStatus,
  ModelTaskType,
  ConnectionStatus,
  AgentMemoryKind,
  CitationStyle,
  ReferenceEntryType,
  CitationFormat,
  FigureKind,
  ExportFormat,
} from '@/types'

// ============ 项目 ============

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  research: '研究/论文',
  fiction: '小说/长文',
  free_writing: '自由写作',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: '草稿',
  writing: '写作中',
  revising: '修订中',
  ready_to_export: '可导出',
  completed: '已完成',
  archived: '已归档',
}

// ============ 文档 ============

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: '草稿',
  writing: '写作中',
  reviewing: '审阅中',
  completed: '已完成',
  archived: '已归档',
}

// ============ 资料 ============

export const SOURCE_PROCESSING_STATUS_LABEL: Record<SourceProcessingStatus, string> = {
  pending: '等待处理',
  parsing: '解析中',
  parsed: '已解析',
  summarizing: '摘要生成中',
  ready: '已就绪',
  failed: '处理失败',
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  active: '可用',
  archived: '已归档',
}

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  word: 'Word',
  markdown: 'Markdown',
  txt: 'TXT',
  text: '文本',
  web: '网页',
  other: '其他',
}

// ============ 卡片 / 知识 ============

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  deprecated: '已废弃',
  conflict: '有冲突',
  forbidden: '禁止使用',
}

export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  deprecated: '已废弃',
  conflict: '有冲突',
  forbidden: '禁止使用',
}

// ============ 大纲节点 ============

export const OUTLINE_NODE_STATUS_LABEL: Record<OutlineNodeStatus, string> = {
  draft: '草稿',
  writing: '写作中',
  completed: '已完成',
  archived: '已归档',
}

// ============ Agent / 任务 ============

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
  research_assistant: '论文助手',
  source_assistant: '资料助手',
  outline_assistant: '结构助手',
  writing_assistant: '写作助手',
  card_assistant: '卡片助手',
  knowledge_assistant: '知识助手',
  format_assistant: '格式助手',
}

// ============ 模型 ============

export const MODEL_TASK_TYPE_LABEL: Record<ModelTaskType, string> = {
  chat: '日常对话',
  rewrite: '改写',
  expand: '扩写',
  summarize: '摘要',
  generate_outline: '大纲生成',
  parse_source: '资料解析',
  generate_card: '卡片生成',
}

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  untested: '未测试',
  connected: '已连接',
  failed: '连接失败',
}

export const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

// ============ 导出 / 任务 ============

export const EXPORT_TASK_STATUS_LABEL: Record<ExportTaskStatus, string> = {
  pending: '等待中',
  running: '导出中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export const TASK_TYPE_LABEL: Record<string, string> = {
  parse_source: '资料解析',
  summarize_source: '资料摘要',
  agent_run: '智能助手调用',
  generate_outline: '大纲生成',
  export_document: '文档导出',
  build_search_index: '搜索索引构建',
}

// ============ Agent 记忆 ============

export const AGENT_MEMORY_KIND_LABEL: Record<AgentMemoryKind, string> = {
  preference: '用户偏好',
  fact: '事实信息',
  decision: '关键决策',
  style: '写作风格',
  summary: '对话摘要',
}

// ============ 论文写作 ============

export const CITATION_STYLE_LABEL: Record<CitationStyle, string> = {
  gbt7714_2015: 'GB/T 7714-2015',
  apa7: 'APA 第7版',
  ieee: 'IEEE',
  mla9: 'MLA 第9版',
}

export const REFERENCE_ENTRY_TYPE_LABEL: Record<ReferenceEntryType, string> = {
  journal: '期刊文章 [J]',
  book: '专著 [M]',
  conference: '会议论文 [C]',
  thesis: '学位论文 [D]',
  web: '电子文献 [EB/OL]',
  other: '其他 [Z]',
}

export const CITATION_FORMAT_LABEL: Record<CitationFormat, string> = {
  numeric: '数字编号 [1]',
  author_year: '作者-年份 (Smith, 2020)',
}

export const FIGURE_KIND_LABEL: Record<FigureKind, string> = {
  figure: '图',
  table: '表',
}

export const EXPORT_FORMAT_LABEL: Record<ExportFormat, string> = {
  markdown: 'Markdown (.md)',
  txt: 'TXT (.txt)',
  word: 'Word (.doc)',
  latex: 'LaTeX (.tex)',
  docx: 'Word (.docx)',
}

// ============ 状态颜色映射（用于标签样式）============

export type TagColor = 'default' | 'brand' | 'accent' | 'info' | 'purple' | 'danger'

export const STATUS_COLOR_MAP: Record<string, TagColor> = {
  // 通用
  draft: 'default',
  pending: 'accent',
  active: 'brand',
  archived: 'default',

  // 进行中类
  writing: 'info',
  parsing: 'info',
  running: 'info',
  summarizing: 'info',
  reviewing: 'info',
  revising: 'info',

  // 完成类
  completed: 'brand',
  succeeded: 'brand',
  ready: 'brand',
  confirmed: 'brand',
  ready_to_export: 'brand',
  parsed: 'brand',

  // 异常类
  failed: 'danger',
  deprecated: 'danger',
  forbidden: 'danger',
  conflict: 'accent',

  // 取消
  cancelled: 'default',
  rejected: 'default',

  // 连接状态
  connected: 'brand',
  untested: 'accent',
}

/// 根据状态获取标签颜色
export function getStatusColor(status: string): TagColor {
  return STATUS_COLOR_MAP[status] ?? 'default'
}
