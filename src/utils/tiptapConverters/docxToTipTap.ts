// Word .docx → TipTap 转换器语义入口
// 对应任务:项目从外部文档导入
//
// 说明:docx 经 Rust 端 extract_docx_structured 解析后,
// 产出的 StructuredDoc 与 markdown/text 走相同节点结构,
// 因此复用 markdownToTipTap 的 structuredDocToTipTap。

export { structuredDocToTipTap as docxToTipTap } from './markdownToTipTap'
