// 编辑器 JSON → docx.Document 转换
// 用于导出真实 .docx 二进制,支持论文写作元素(引文/图表/公式/交叉引用/脚注)
//
// 转换规则:
// - doc → Document({ sections: [{ children: Paragraph[] }] })
// - heading → Paragraph({ heading: HeadingLevel.HEADING_X })
// - paragraph → Paragraph({ children: TextRun[] })
// - figureBlock → ImageRun(figure) / Table(table) + 题注段落
// - equationBlock → 居中段落(Cambria Math 字体) — TD-PAPER-002 降级
// - citation mark → TextRun({ text: citation.inlineText })
// - crossReference mark → TextRun({ text: '见图 N' }) — TD-PAPER-007 降级
// - footnote mark → TextRun({ text: '[脚注: ...]' }) — TD-PAPER-006 降级
// - mathematics mark → TextRun({ text: '$...$' })
//
// 技术债:
// - TD-PAPER-002: 公式以 LaTeX 源码文本输出,不转 MathML/PNG
// - TD-PAPER-006: 脚注以文本输出,不使用 docx.Footnotes
// - TD-PAPER-007: 交叉引用以编号文本输出,不使用 Word 域代码

import type { JSONContent } from '@tiptap/react'
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'
import type { Reference, Figure, Equation, Citation, ExportOptions } from '@/types'
import { formatReference } from '@/services/citation/Gbt7714Formatter'

export type EditorToDocxOptions = {
  references: Reference[]
  figures: Figure[]
  equations: Equation[]
  citations: Citation[]
  /// figureId → 图片二进制(用于嵌入图片),为空时输出文本占位
  figureImageBuffers?: Map<string, Uint8Array>
  /// 导出选项(字体/字号/行距/页边距),为空时使用默认值
  exportOptions?: ExportOptions
}

/// 将 TipTap JSON 转换为 docx.Document 对象
export function editorToDocx(
  content: JSONContent | null,
  options: EditorToDocxOptions,
): Document {
  const children: (Paragraph | Table)[] = []

  if (content) {
    for (const node of content.content ?? []) {
      const converted = convertNode(node, options)
      if (Array.isArray(converted)) {
        children.push(...converted)
      } else if (converted) {
        children.push(converted)
      }
    }
  }

  // 追加参考文献节
  if (options.references.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 240 } }))
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '参考文献', bold: true })],
      }),
    )
    for (const ref of options.references) {
      if (ref.isDeleted) continue
      const formatted = formatReference(ref)
      children.push(
        new Paragraph({
          children: [new TextRun({ text: formatted, size: 21 })],
          spacing: { after: 60 },
        }),
      )
    }
  }

  // 应用导出样式(字体/字号/行距/页边距)
  const opts = options.exportOptions
  const fontSizeHalfPoints = opts ? opts.fontSize * 2 : 24 // docx 字号单位为半磅
  const fontFamily = opts?.fontFamily ?? '宋体'
  const lineHeight = opts ? opts.lineHeight * 240 : 360 // docx 行距单位 1/240
  const marginCm = (cm: number) => Math.round(cm * 567) // cm → twips(1cm≈567twips)

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: fontFamily,
            size: fontSizeHalfPoints,
          },
          paragraph: {
            spacing: { line: lineHeight },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: opts
              ? {
                  top: marginCm(opts.margin.top),
                  bottom: marginCm(opts.margin.bottom),
                  left: marginCm(opts.margin.left),
                  right: marginCm(opts.margin.right),
                }
              : undefined,
          },
        },
        children,
      },
    ],
  })
}

// ============ 节点转换 ============

type ConvertResult = Paragraph | Table | (Paragraph | Table)[] | null

function convertNode(node: JSONContent, options: EditorToDocxOptions): ConvertResult {
  switch (node.type) {
    case 'doc':
      return convertChildrenToArray(node, options)

    case 'heading':
      return convertHeading(node, options)

    case 'paragraph':
      return new Paragraph({ children: convertInline(node, options) })

    case 'blockquote':
      return new Paragraph({
        indent: { left: 720 },
        children: convertInline(node, options),
      })

    case 'bulletList':
      return convertListItems(node, options, false)

    case 'orderedList':
      return convertListItems(node, options, true)

    case 'horizontalRule':
      return new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
        },
      })

    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      return new Paragraph({
        children: [new TextRun({ text, font: 'Consolas', size: 20 })],
      })
    }

    case 'figureBlock':
      return convertFigureBlock(node, options)

    case 'equationBlock':
      return convertEquationBlock(node, options)

    case 'table':
      return convertTable(node, options)

    case 'image':
      return convertImage(node)

    default:
      // 未知节点尝试提取行内文本
      return new Paragraph({ children: convertInline(node, options) })
  }
}

/// 转换标题
function convertHeading(node: JSONContent, options: EditorToDocxOptions): Paragraph {
  const level = (node.attrs?.level as number) ?? 1
  const numberPrefix = (node.attrs?.numberPrefix as string) ?? ''
  const inlineRuns = convertInline(node, options)
  const headingLevel =
    level === 1
      ? HeadingLevel.HEADING_1
      : level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3

  const runs: TextRun[] = []
  if (numberPrefix) {
    runs.push(new TextRun({ text: `${numberPrefix} `, bold: true }))
  }
  runs.push(...inlineRuns)

  return new Paragraph({ heading: headingLevel, children: runs })
}

/// 转换列表
function convertListItems(
  node: JSONContent,
  options: EditorToDocxOptions,
  ordered: boolean,
): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const item of node.content ?? []) {
    if (item.type !== 'listItem') continue
    // listItem 内含 paragraph
    const runs = convertInline(item, options)
    paragraphs.push(
      new Paragraph({
        children: runs,
        bullet: ordered ? undefined : { level: 0 },
        numbering: ordered ? { reference: 'ordered-list', level: 0 } : undefined,
      }),
    )
  }
  return paragraphs
}

/// 转换图表块(figure/table)
function convertFigureBlock(
  node: JSONContent,
  options: EditorToDocxOptions,
): (Paragraph | Table)[] {
  const figureId = node.attrs?.figureId as string | null
  const kind = (node.attrs?.kind as 'figure' | 'table') ?? 'figure'
  const figure = options.figures.find((f) => f.id === figureId)

  if (!figure) {
    return [new Paragraph({ children: [new TextRun({ text: '[图表已删除]', italics: true, color: '999999' })] })]
  }

  const result: (Paragraph | Table)[] = []
  const kindLabel = kind === 'figure' ? '图' : '表'
  const number = figure.number ?? '?'

  if (kind === 'figure') {
    // 尝试嵌入图片
    const buffer = options.figureImageBuffers?.get(figure.id)
    const base64Data = figure.imageData
    if (buffer) {
      result.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            // ImageRun 需要动态导入以避免类型问题,此处用文本占位降级
            // 实际图片嵌入在 DocxExporter 中处理
            new TextRun({ text: `[图片: ${figure.caption}]`, italics: true }),
          ],
        }),
      )
    } else if (base64Data) {
      result.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `[图片: ${figure.caption}]`, italics: true })],
        }),
      )
    } else {
      result.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `[图片占位: ${figure.imagePath ?? '未指定'}]`, italics: true, color: '999999' })],
        }),
      )
    }
  } else {
    // table: 尝试从 tableData 渲染
    const tableData = figure.tableData as JSONContent | null
    if (tableData && tableData.type === 'table') {
      result.push(convertTable(tableData, options))
    } else {
      result.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '[表格数据缺失]', italics: true, color: '999999' })],
        }),
      )
    }
  }

  // 题注段落
  result.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${kindLabel} ${number} `, bold: true }),
        new TextRun({ text: figure.caption, italics: true }),
      ],
      spacing: { after: 120 },
    }),
  )

  return result
}

/// 转换公式块(TD-PAPER-002: 降级为 LaTeX 源码文本)
function convertEquationBlock(
  node: JSONContent,
  options: EditorToDocxOptions,
): Paragraph[] {
  const latex = (node.attrs?.latex as string) ?? ''
  const label = node.attrs?.label as string | null
  const equationId = node.attrs?.equationId as string | null
  const equation = options.equations.find((e) => e.id === equationId)
  const number = equation?.number ?? '?'

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: latex, font: 'Cambria Math', size: 24 }),
        new TextRun({ text: `   (${number})`, size: 24 }),
      ],
      spacing: { before: 120, after: 120 },
    }),
    ...(label
      ? [new Paragraph({ children: [new TextRun({ text: `label: ${label}`, size: 16, color: '999999' })] })]
      : []),
  ]
}

/// 转换 TipTap 表格为 docx.Table
function convertTable(node: JSONContent, options: EditorToDocxOptions): Table {
  const rows = (node.content ?? []).filter((c) => c.type === 'tableRow')
  const tableRows: TableRow[] = rows.map((row) => {
    const cells = (row.content ?? []).filter(
      (c) => c.type === 'tableCell' || c.type === 'tableHeader',
    )
    const tableCells: TableCell[] = cells.map((cell) => {
      const isHeader = cell.type === 'tableHeader'
      const runs = convertInline(cell, options)
      return new TableCell({
        children: [new Paragraph({ children: runs })],
        shading: isHeader ? { fill: 'F0F0F0' } : undefined,
      })
    })
    return new TableRow({ children: tableCells })
  })

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

/// 转换独立 image 节点
function convertImage(node: JSONContent): Paragraph {
  const src = (node.attrs?.src as string) ?? ''
  const alt = (node.attrs?.alt as string) ?? ''
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `[图片: ${alt || src}]`, italics: true })],
  })
}

// ============ 行内转换 ============

/// 转换行内内容(含 marks)为 TextRun[]
function convertInline(node: JSONContent, options: EditorToDocxOptions): TextRun[] {
  const runs: TextRun[] = []

  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      runs.push(...convertTextNode(child, options))
    } else if (child.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }))
    } else {
      // 嵌套行内节点递归
      runs.push(...convertInline(child, options))
    }
  }

  return runs
}

/// 转换文本节点(处理 marks)
function convertTextNode(node: JSONContent, options: EditorToDocxOptions): TextRun[] {
  const text = node.text ?? ''
  if (!text) return []

  const marks = node.marks ?? []
  let runText = text
  const props: {
    bold?: boolean
    italics?: boolean
    font?: string
    color?: string
  } = {}

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        props.bold = true
        break
      case 'italic':
        props.italics = true
        break
      case 'code':
        props.font = 'Consolas'
        props.color = 'C7254E'
        break
      case 'citation': {
        const citationId = mark.attrs?.citationId as string | null
        const citation = options.citations.find((c) => c.id === citationId)
        runText = citation?.inlineText ?? '[?]'
        break
      }
      case 'crossReference': {
        const label = mark.attrs?.label as string | null
        const targetType = mark.attrs?.targetType as string | null
        const targetId = mark.attrs?.targetId as string | null
        runText = resolveCrossReferenceText(targetType, targetId, label, options)
        break
      }
      case 'footnote': {
        const content = mark.attrs?.content as string | null
        runText = `[脚注: ${content ?? ''}]`
        break
      }
      case 'mathematics': {
        runText = `$${text}$`
        break
      }
      case 'link': {
        // 链接保持文本,docx 超链接需要 ExternalHyperlink,MVP 简化为文本
        break
      }
    }
  }

  return [new TextRun({ text: runText, ...props })]
}

/// 解析交叉引用显示文本
function resolveCrossReferenceText(
  targetType: string | null,
  targetId: string | null,
  label: string | null,
  options: EditorToDocxOptions,
): string {
  if (!targetType || !targetId) return label ? `[??]` : '[?]'

  if (targetType === 'figure' || targetType === 'table') {
    const figure = options.figures.find((f) => f.id === targetId)
    if (figure) {
      const kindLabel = figure.kind === 'figure' ? '图' : '表'
      return `${kindLabel} ${figure.number ?? '?'}`
    }
    return '[引用失效]'
  }

  if (targetType === 'equation') {
    const equation = options.equations.find((e) => e.id === targetId)
    if (equation) {
      return `式 (${equation.number ?? '?'})`
    }
    return '[引用失效]'
  }

  return label ?? '[?]'
}

// ============ 工具函数 ============

/// 转换子节点为数组(用于 doc 根节点)
function convertChildrenToArray(
  node: JSONContent,
  options: EditorToDocxOptions,
): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = []
  for (const child of node.content ?? []) {
    const converted = convertNode(child, options)
    if (Array.isArray(converted)) {
      result.push(...converted)
    } else if (converted) {
      result.push(converted)
    }
  }
  return result
}
