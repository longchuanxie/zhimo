// LaTeX 导出器
// 生成完整 .tex 文件源码(preamble + body + bibliography)
//
// 结构:
// \documentclass{article}
// \usepackage{ctex}  % 中文支持
// \usepackage{graphicx}
// \usepackage{amsmath}
// \usepackage{hyperref}
// \title{...}
// \begin{document}
// \maketitle
// \tableofcontents  % 若 includeTOC
// ...body(经 injectSectionNumbers + editorToLatex)...
// \begin{thebibliography}{99}
// \bibitem{key1} GB/T 7714 格式条目
// \end{thebibliography}
// \end{document}

import type { JSONContent } from '@tiptap/react'
import type { Reference, Figure, Equation, Citation, ExportOptions } from '@/types'
import { editorToLatex } from '@/components/editor/editorToLatex'
import { injectSectionNumbers } from './injectSectionNumbers'
import { formatReference } from '@/services/citation/Gbt7714Formatter'

export type LatexExportInput = {
  title: string
  content: JSONContent
  references: Reference[]
  figures: Figure[]
  equations: Equation[]
  citations: Citation[]
  options: ExportOptions
}

/// 生成完整 LaTeX 文件源码
export function exportToLatex(input: LatexExportInput): string {
  const { title, content, references, figures, equations, citations, options } = input

  // 1. 注入章节编号
  const numberedContent = injectSectionNumbers(content)

  // 2. 转换 body
  const body = editorToLatex(numberedContent, {
    references,
    figures,
    equations,
    citations,
  })

  // 3. 构建 preamble
  const preamble = buildPreamble(title, options)

  // 4. 构建参考文献
  const bibliography = buildBibliography(references, citations)

  // 5. 拼接
  const parts: string[] = [preamble]

  parts.push('\\begin{document}')
  parts.push('\\maketitle')

  if (options.includeTOC) {
    parts.push('\\tableofcontents')
    parts.push('\\newpage')
  }

  if (body) {
    parts.push(body)
  }

  if (bibliography) {
    parts.push(bibliography)
  }

  parts.push('\\end{document}')

  return parts.join('\n\n')
}

/// 构建 LaTeX preamble
function buildPreamble(title: string, options: ExportOptions): string {
  const escapedTitle = escapeLatexTitle(title)
  const lines: string[] = [
    '\\documentclass[a4paper,12pt]{article}',
    '% 中文支持',
    '\\usepackage[UTF8]{ctex}',
    '% 图片',
    '\\usepackage{graphicx}',
    '% 公式',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '% 超链接',
    '\\usepackage{hyperref}',
    '% 页面边距',
    `\\usepackage[a4paper, top=${options.margin.top}cm, bottom=${options.margin.bottom}cm, left=${options.margin.left}cm, right=${options.margin.right}cm]{geometry}`,
    '',
    `\\title{${escapedTitle}}`,
    '\\author{}',
    '\\date{}',
  ]
  return lines.join('\n')
}

/// 构建参考文献节
function buildBibliography(
  references: Reference[],
  citations: Citation[],
): string {
  // 按引文出现顺序去重排列参考文献
  const seen = new Set<string>()
  const ordered: Reference[] = []

  for (const citation of citations) {
    const ref = references.find((r) => r.id === citation.referenceId)
    if (!ref || ref.isDeleted) continue
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    ordered.push(ref)
  }

  if (ordered.length === 0) return ''

  const items = ordered
    .map((ref) => {
      const formatted = formatReference(ref)
      return `\\bibitem{${ref.citationKey}} ${formatted}`
    })
    .join('\n')

  const widthHint = ordered.length > 9 ? '99' : '9'
  return `\\begin{thebibliography}{${widthHint}}\n${items}\n\\end{thebibliography}`
}

/// 转义 LaTeX 标题特殊字符
function escapeLatexTitle(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}
