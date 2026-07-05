// DOCX 导出器
// 生成 .docx 二进制 Uint8Array,使用 docx 库
//
// 流程:
// 1. injectSectionNumbers 注入章节编号
// 2. editorToDocx 转换为 docx.Document(含字体/字号/行距/页边距样式)
// 3. Packer.toBlob 生成二进制
// 4. 转为 Uint8Array 供 fileGateway.writeBinary 写入

import type { JSONContent } from '@tiptap/react'
import { Packer } from 'docx'
import type { Reference, Figure, Equation, Citation, ExportOptions } from '@/types'
import { editorToDocx } from '@/components/editor/editorToDocx'
import { injectSectionNumbers } from './injectSectionNumbers'

export type DocxExportInput = {
  title: string
  content: JSONContent
  references: Reference[]
  figures: Figure[]
  equations: Equation[]
  citations: Citation[]
  options: ExportOptions
  /// figureId → 图片二进制(用于嵌入图片)
  figureImageBuffers?: Map<string, Uint8Array>
}

/// 生成 .docx 二进制
export async function exportToDocx(input: DocxExportInput): Promise<Uint8Array> {
  const { content, references, figures, equations, citations, options, figureImageBuffers } = input

  // 1. 注入章节编号
  const numberedContent = injectSectionNumbers(content)

  // 2. 转换为 docx.Document(含样式)
  const document = editorToDocx(numberedContent, {
    references,
    figures,
    equations,
    citations,
    figureImageBuffers,
    exportOptions: options,
  })

  // 3. 生成二进制
  const blob = await Packer.toBlob(document)
  const arrayBuffer = await blob.arrayBuffer()

  return new Uint8Array(arrayBuffer)
}
