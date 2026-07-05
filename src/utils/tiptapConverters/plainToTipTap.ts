// 纯文本 → TipTap 转换器语义入口
// 对应任务:项目从外部文档导入
//
// 说明:.txt 经 Rust 端 parse_text_file 解析后,
// 产出的 StructuredDoc 与其他格式走相同节点结构,
// 因此复用 markdownToTipTap 的 structuredDocToTipTap。

export { structuredDocToTipTap as plainToTipTap } from './markdownToTipTap'
