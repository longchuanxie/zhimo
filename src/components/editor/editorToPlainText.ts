// 编辑器 JSON → 纯文本转换
// 用于 plain_text 字段存储、字数统计、ContextPack 组装、导出
//
// 支持论文写作节点:
// - figureBlock → [图表] 占位
// - equationBlock → [公式] 占位
// - citation mark → 保留原文本(引文标注文本由编辑器内联显示)
// - crossReference mark → 保留原文本
// - footnote mark → 文本后追加 (脚注: 内容)
// - mathematics mark → 保留原文本(含 $...$)

import type { JSONContent } from '@tiptap/react'

/// 将 TipTap JSON 转换为纯文本
export function editorToPlainText(content: JSONContent | null): string {
  if (!content) return ''
  return extractText(content).trim()
}

function extractText(node: JSONContent): string {
  // 文本节点:处理 marks
  if (node.type === 'text') {
    return extractTextNode(node)
  }

  // 图表块:输出占位(无文本子节点)
  if (node.type === 'figureBlock') {
    const kind = node.attrs?.kind as string | undefined
    const kindLabel = kind === 'table' ? '表格' : '图表'
    return `\n[${kindLabel}]\n`
  }

  // 公式块:输出占位(无文本子节点)
  if (node.type === 'equationBlock') {
    return `\n[公式]\n`
  }

  // 图片节点:输出占位
  if (node.type === 'image') {
    const alt = (node.attrs?.alt as string) ?? ''
    return alt ? `\n[图片: ${alt}]\n` : '\n[图片]\n'
  }

  // 子节点递归
  const childText = (node.content ?? []).map(extractText).join('')

  // 块级节点之间添加换行
  const blockTypes = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem']
  if (blockTypes.includes(node.type ?? '')) {
    return childText + '\n'
  }

  // 列表项之间添加换行
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return childText
  }

  // 文档根节点
  if (node.type === 'doc') {
    return childText
  }

  return childText
}

/// 提取文本节点内容(处理行内 marks)
function extractTextNode(node: JSONContent): string {
  const text = node.text ?? ''
  if (!text) return ''

  const marks = node.marks ?? []
  let result = text

  for (const mark of marks) {
    switch (mark.type) {
      case 'footnote': {
        // 脚注:文本后追加脚注内容
        const content = mark.attrs?.content as string | null
        if (content) {
          result = `${result}(脚注: ${content})`
        }
        break
      }
      // citation / crossReference / mathematics / bold / italic / code / link
      // 均保留原文本,无需特殊处理
    }
  }

  return result
}
