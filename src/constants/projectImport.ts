// 项目从外部文档导入流程的常量与文案
// 对应任务:项目从外部文档导入
//
// 职责:
// - 集中维护支持的文档扩展名
// - 集中维护格式中文名称(避免散落在 UI 中)
// - 集中维护三步流程的步骤标题
// - 集中维护默认文档标题

/// 支持导入的文档扩展名(与 Rust 端 parse_document_structured 分流一致)
/// 注意:扩展名带点,与 @tauri-apps/plugin-dialog 的 filters.extensions 格式一致
export const SUPPORTED_IMPORT_EXTENSIONS = ['.md', '.markdown', '.txt', '.docx', '.pdf']

/// 文档格式中文名称映射(键对应 StructuredDocFormat)
export const IMPORT_FORMAT_LABEL: Record<string, string> = {
  markdown: 'Markdown',
  word: 'Word 文档',
  pdf: 'PDF 文档',
  text: '纯文本',
}

/// 三步流程的步骤标识与中文名称
export const IMPORT_STEPS = {
  select: '选择文档',
  infer: '推断元数据',
  confirm: '确认创建',
} as const

/// 新建正文 Document 的默认标题
export const IMPORT_DEFAULT_DOCUMENT_TITLE = '正文'
