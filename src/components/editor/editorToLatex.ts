// 编辑器 JSON → LaTeX 源码转换
// 用于导出 .tex 文件,支持论文写作元素(引文/图表/公式/交叉引用/脚注)
//
// 转换规则:
// - heading → \section/\subsection/\subsubsection
// - paragraph → 段落
// - blockquote → \begin{quote}
// - bulletList/orderedList → \begin{itemize}/\begin{enumerate}
// - figureBlock → \begin{figure}\includegraphics\caption
// - equationBlock → \begin{equation}\label
// - citation mark → \cite
// - crossReference mark → \ref
// - footnote mark → \footnote
// - mathematics inline → $...$

import type { JSONContent } from '@tiptap/react'
import type { Reference, Figure, Equation, Citation } from '@/types'

export type EditorToLatexOptions = {
  references: Reference[]
  figures: Figure[]
  equations: Equation[]
  citations: Citation[]
}

/// 将 TipTap JSON 转换为 LaTeX body 源码(不含 preamble)
export function editorToLatex(
  content: JSONContent | null,
  options: EditorToLatexOptions,
): string {
  if (!content) return ''
  return convertNode(content, options).trim()
}

/// 转换节点
function convertNode(node: JSONContent, options: EditorToLatexOptions): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((child) => convertNode(child, options)).join('\n\n')

    case 'heading': {
      const level = node.attrs?.level ?? 1
      const text = convertInline(node, options)
      const command = level === 1 ? 'section' : level === 2 ? 'subsection' : 'subsubsection'
      return `\\${command}{${escapeLatex(text)}}`
    }

    case 'paragraph':
      return convertInline(node, options)

    case 'blockquote':
      return `\\begin{quote}\n${convertChildren(node, options)}\n\\end{quote}`

    case 'bulletList':
      return `\\begin{itemize}\n${convertListItems(node, options)}\n\\end{itemize}`

    case 'orderedList':
      return `\\begin{enumerate}\n${convertListItems(node, options)}\n\\end{enumerate}`

    case 'listItem':
      return `\\item ${convertInline(node, options)}`

    case 'horizontalRule':
      return '\\noindent\\rule{\\textwidth}{0.4pt}'

    case 'codeBlock':
      return `\\begin{verbatim}\n${node.content?.map((c) => c.text ?? '').join('') ?? ''}\n\\end{verbatim}`

    case 'figureBlock': {
      const figureId = node.attrs?.figureId as string | null
      const figure = options.figures.find((f) => f.id === figureId)
      if (!figure) return ''
      const kind = node.attrs?.kind ?? 'figure'
      const env = kind === 'figure' ? 'figure' : 'table'
      const caption = escapeLatex(figure.caption)
      const label = figure.label ? `\n\\label{${figure.label}}` : ''
      if (kind === 'figure') {
        const imageRef = figure.imagePath ? figure.imagePath : 'image-placeholder'
        return `\\begin{${env}}[h]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{${imageRef}}\n\\caption{${caption}}${label}\n\\end{${env}}`
      }
      // table 简化:仅输出题注
      return `\\begin{${env}}[h]\n\\centering\n\\caption{${caption}}${label}\n\\end{${env}}`
    }

    case 'equationBlock': {
      const latex = (node.attrs?.latex as string) ?? ''
      const label = node.attrs?.label as string | null
      const labelCmd = label ? `\\label{${label}}` : ''
      return `\\begin{equation}\n${latex}\n${labelCmd}\n\\end{equation}`
    }

    case 'table':
      return convertTable(node, options)

    case 'image': {
      const src = (node.attrs?.src as string) ?? ''
      return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{${src}}\n\\end{figure}`
    }

    default:
      return convertInline(node, options)
  }
}

/// 转换行内内容(含 marks)
function convertInline(node: JSONContent, options: EditorToLatexOptions): string {
  if (node.type === 'text') {
    let text = escapeLatex(node.text ?? '')
    // 处理 marks
    const marks = node.marks ?? []
    for (const mark of marks) {
      switch (mark.type) {
        case 'bold':
          text = `\\textbf{${text}}`
          break
        case 'italic':
          text = `\\textit{${text}}`
          break
        case 'code':
          text = `\\texttt{${text}}`
          break
        case 'citation': {
          const citationId = mark.attrs?.citationId as string | null
          const citation = options.citations.find((c) => c.id === citationId)
          if (citation) {
            const ref = options.references.find((r) => r.id === citation.referenceId)
            if (ref) {
              text = `\\cite{${ref.citationKey}}`
            }
          }
          break
        }
        case 'crossReference': {
          const label = mark.attrs?.label as string | null
          if (label) {
            text = `\\ref{${label}}`
          }
          break
        }
        case 'footnote': {
          const content = mark.attrs?.content as string | null
          if (content) {
            text = `\\footnote{${escapeLatex(content)}}`
          }
          break
        }
        case 'mathematics': {
          // 行内公式 $...$
          text = `$${text}$`
          break
        }
      }
    }
    return text
  }
  return convertChildren(node, options)
}

/// 转换子节点
function convertChildren(node: JSONContent, options: EditorToLatexOptions): string {
  return (node.content ?? []).map((child) => convertInline(child, options)).join('')
}

/// 转换列表项
function convertListItems(node: JSONContent, options: EditorToLatexOptions): string {
  return (node.content ?? [])
    .map((child) => convertNode(child, options))
    .join('\n')
}

/// 转换表格(TipTap Table 扩展)
function convertTable(node: JSONContent, options: EditorToLatexOptions): string {
  const rows = (node.content ?? []).filter((c) => c.type === 'tableRow')
  if (rows.length === 0) return ''
  // 计算列数
  const firstRow = rows[0]?.content ?? []
  const colCount = firstRow.filter((c) => c.type === 'tableCell' || c.type === 'tableHeader').length
  const colSpec = 'l'.repeat(colCount)

  const rowsLatex = rows
    .map((row) => {
      const cells = (row.content ?? []).filter((c) => c.type === 'tableCell' || c.type === 'tableHeader')
      const cellsLatex = cells.map((cell) => convertChildren(cell, options).trim()).join(' & ')
      return `  ${cellsLatex} \\\\`
    })
    .join('\n')

  return `\\begin{tabular}{${colSpec}}\n${rowsLatex}\n\\end{tabular}`
}

/// LaTeX 特殊字符转义
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
}
