// StructuredDoc → TipTap ProseMirror JSON 转换器
// 对应任务:项目从外部文档导入
//
// 职责:
// - 把 Rust 端 parse_document_structured 返回的 StructuredDoc 转为 TipTap JSON
// - 覆盖 heading/paragraph/bulletList/orderedList/codeBlock/table 六种结构化节点
// - ImagePlaceholder 节点跳过(技术债 TD-IMPORT-02)
// - 空文档兜底为单个空段落(TipTap 要求 doc 至少有一个块级节点)
//
// 注意:该转换器同时服务于 markdown/text/docx/pdf 四种来源,
// 因为它们在 StructuredDoc 层面已经统一为相同的节点结构。
// docxToTipTap.ts / plainToTipTap.ts 仅作为语义入口 re-export 本函数。

import type { DocxRun, StructuredDoc, StructuredDocNode } from '@/types/projectImport'
import type {
  TipTapDoc,
  TipTapInline,
  TipTapListItem,
  TipTapMark,
  TipTapNode,
  TipTapParagraph,
  TipTapTableCell,
  TipTapTableRow,
  TipTapTextNode,
} from './types'

/// 把单个 DocxRun 转为 TipTap text 行内节点
function runToInline(run: DocxRun): TipTapTextNode {
  const marks: TipTapMark[] = []
  if (run.bold) marks.push({ type: 'bold' })
  if (run.italic) marks.push({ type: 'italic' })
  return marks.length > 0
    ? { type: 'text', text: run.text, marks }
    : { type: 'text', text: run.text }
}

/// 把 runs 数组转为行内节点数组(过滤空文本,避免 TipTap 空 text 节点)
function runsToInlines(runs: DocxRun[]): TipTapInline[] {
  return runs
    .filter((r) => r.text.length > 0)
    .map(runToInline)
}

/// 把 runs 数组转为单个 paragraph 节点
function runsToParagraph(runs: DocxRun[]): TipTapParagraph {
  return { type: 'paragraph', content: runsToInlines(runs) }
}

/// 把单个 StructuredDocNode 转为 TipTap 节点数组
/// 返回数组是因为大多数节点产出 1 个 TipTap 节点,
/// 但 ImagePlaceholder 产出 0 个(跳过)
function nodeToTipTapNodes(node: StructuredDocNode): TipTapNode[] {
  switch (node.kind) {
    case 'heading': {
      if (node.text.length === 0) return []
      return [
        {
          type: 'heading',
          attrs: { level: node.level },
          content: [{ type: 'text', text: node.text }],
        },
      ]
    }
    case 'paragraph': {
      return [runsToParagraph(node.runs)]
    }
    case 'bulletList': {
      const items = node.items
        .filter((runs) => runs.length > 0)
        .map((runs): TipTapListItem => ({
          type: 'listItem',
          content: [runsToParagraph(runs)],
        }))
      if (items.length === 0) return []
      return [{ type: 'bulletList', content: items }]
    }
    case 'orderedList': {
      const items = node.items
        .filter((runs) => runs.length > 0)
        .map((runs): TipTapListItem => ({
          type: 'listItem',
          content: [runsToParagraph(runs)],
        }))
      if (items.length === 0) return []
      return [{ type: 'orderedList', content: items }]
    }
    case 'codeBlock': {
      if (node.text.length === 0) return []
      return [
        {
          type: 'codeBlock',
          attrs: { language: node.language },
          content: [{ type: 'text', text: node.text }],
        },
      ]
    }
    case 'table': {
      if (node.rows.length === 0) return []
      const rows: TipTapTableRow[] = node.rows.map((row) => ({
        type: 'tableRow',
        content: row.map((cellRuns): TipTapTableCell => ({
          type: 'tableCell',
          content: [runsToParagraph(cellRuns)],
        })),
      }))
      return [{ type: 'table', content: rows }]
    }
    case 'imagePlaceholder': {
      // 技术债 TD-IMPORT-02:docx 图片暂未导入,跳过
      return []
    }
  }
}

/// 把 StructuredDoc 转为 TipTap 文档 JSON
///
/// 空文档(nodes 为空或全部被跳过)兜底为单个空段落,
/// 因为 TipTap 编辑器要求 doc.content 至少有一个块级节点。
export function structuredDocToTipTap(doc: StructuredDoc): TipTapDoc {
  const content: TipTapNode[] = []
  for (const node of doc.nodes) {
    content.push(...nodeToTipTapNodes(node))
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] })
  }
  return { type: 'doc', content }
}
