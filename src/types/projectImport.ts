// 项目从外部文档导入流程的类型定义
// 对应任务:项目从外部文档导入
//
// 职责:
// - 镜像 Rust 端 StructuredDoc 的前端类型(用于 invoke 返回值类型约束)
// - 定义 AI 推断的项目元数据结构
// - 定义「从文档创建项目」完整输入与返回结果
//
// 注意:StructuredDocNode 使用 discriminated union(tag = kind),
// 与 Rust 端 #[serde(tag = "kind", rename_all = "camelCase")] 对齐。

import type { ProjectType } from '@/types'

/// 文档来源格式(与 Rust 端 StructuredDocFormat 对齐,serde rename_all = "lowercase")
export type StructuredDocFormat = 'markdown' | 'word' | 'pdf' | 'text'

/// 富文本 run(对应 TipTap text 节点 + marks)
export type DocxRun = {
  text: string
  bold: boolean
  italic: boolean
}

/// 结构化节点(对应 TipTap 顶层块级节点)
/// tag = kind,与 Rust 端 serde 标签一致
export type StructuredDocNode =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; runs: DocxRun[] }
  | { kind: 'bulletList'; items: DocxRun[][] }
  | { kind: 'orderedList'; items: DocxRun[][] }
  | { kind: 'codeBlock'; language: string | null; text: string }
  | { kind: 'table'; rows: DocxRun[][][] }
  | { kind: 'imagePlaceholder' }

/// 结构化文档(Rust 端 parse_document_structured 命令返回值)
export type StructuredDoc = {
  format: StructuredDocFormat
  nodes: StructuredDocNode[]
  /// 全文纯文本(用于 AI 推断项目元数据)
  plainText: string
  /// 字数(Rust 端 estimate_word_count 产出)
  wordCount: number
}

/// AI 推断的项目元数据
export type InferredProjectMeta = {
  name: string
  type: ProjectType
  description: string
  writingGoal: string
  targetReader: string
  targetWordCount: number
}

/// 「从文档创建项目」完整输入
export type CreateProjectFromDocumentInput = {
  /// 用户选择的文档绝对路径(用于调试/日志,不参与创建逻辑)
  documentPath: string
  /// Rust 解析后的结构化文档
  structuredDoc: StructuredDoc
  /// 用户确认后的项目元数据
  meta: InferredProjectMeta
  /// 新建正文 Document 的标题
  documentTitle: string
}

/// 「从文档创建项目」返回结果
export type CreatedProjectWithDocument = {
  projectId: string
  documentId: string
}
