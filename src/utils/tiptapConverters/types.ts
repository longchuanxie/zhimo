// TipTap ProseMirror JSON 节点的最小类型定义
// 对应任务:项目从外部文档导入
//
// 职责:
// - 定义 TipTap JSON 的节点与 mark 类型,避免依赖 tiptap 包内部运行时类型
// - 转换器(markdownToTipTap.ts 等)产出这些类型
// - 编辑器(DocumentEditor)消费这些类型时,可安全 as unknown 传入
//
// 仅覆盖项目导入所需的节点:heading/paragraph/bulletList/orderedList/
// listItem/codeBlock/table/tableRow/tableCell/text。

/// mark:粗体
export type TipTapBoldMark = { type: 'bold' }

/// mark:斜体
export type TipTapItalicMark = { type: 'italic' }

/// 所有 mark 的联合
export type TipTapMark = TipTapBoldMark | TipTapItalicMark

/// text 节点(叶子节点)
export type TipTapTextNode = {
  type: 'text'
  text: string
  marks?: TipTapMark[]
}

/// 行内内容(当前 schema 仅支持 text 节点)
export type TipTapInline = TipTapTextNode

/// paragraph 节点
export type TipTapParagraph = {
  type: 'paragraph'
  content: TipTapInline[]
}

/// heading 节点(level: 1-6)
export type TipTapHeading = {
  type: 'heading'
  attrs: { level: number }
  content: TipTapInline[]
}

/// listItem 节点(内容为 paragraph 数组)
export type TipTapListItem = {
  type: 'listItem'
  content: TipTapParagraph[]
}

/// bulletList 节点
export type TipTapBulletList = {
  type: 'bulletList'
  content: TipTapListItem[]
}

/// orderedList 节点
export type TipTapOrderedList = {
  type: 'orderedList'
  content: TipTapListItem[]
}

/// codeBlock 节点(language 为 null 表示未指定)
export type TipTapCodeBlock = {
  type: 'codeBlock'
  attrs: { language: string | null }
  content: TipTapTextNode[]
}

/// tableCell 节点(内容为 paragraph 数组)
export type TipTapTableCell = {
  type: 'tableCell'
  content: TipTapParagraph[]
}

/// tableRow 节点
export type TipTapTableRow = {
  type: 'tableRow'
  content: TipTapTableCell[]
}

/// table 节点
export type TipTapTable = {
  type: 'table'
  content: TipTapTableRow[]
}

/// 所有块级节点的联合(不含 doc)
export type TipTapNode =
  | TipTapParagraph
  | TipTapHeading
  | TipTapListItem
  | TipTapBulletList
  | TipTapOrderedList
  | TipTapCodeBlock
  | TipTapTable
  | TipTapTableRow
  | TipTapTableCell

/// 文档根节点
export type TipTapDoc = {
  type: 'doc'
  content: TipTapNode[]
}
