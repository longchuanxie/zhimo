// 章节编号注入工具
// 遍历 TipTap JSON,为 heading 节点注入 attrs.numberPrefix(如 "1"、"1.1"、"1.1.1")
// 供 LaTeX/DOCX/PlainText 序列化器统一消费,避免编号逻辑分散在各序列化器中
//
// 规则:
// - level 1 → "1"、"2"、...  (重置 level 2/3 计数器)
// - level 2 → "1.1"、"1.2"、...  (重置 level 3 计数器)
// - level 3 → "1.1.1"、"1.1.2"、...
// - 非 heading 节点原样保留
// - 深拷贝输入,不修改原始 JSON

import type { JSONContent } from '@tiptap/react'

/// 为 TipTap JSON 中的 heading 节点注入章节编号
export function injectSectionNumbers(content: JSONContent): JSONContent {
  const counters = [0, 0, 0]
  return walkAndNumber(structuredClone(content), counters)
}

/// 递归遍历并注入编号
function walkAndNumber(node: JSONContent, counters: number[]): JSONContent {
  if (node.type === 'heading') {
    const level = (node.attrs?.level as number) ?? 1
    const idx = Math.min(Math.max(level - 1, 0), 2)

    // 递增当前层级
    counters[idx]++
    // 重置下级计数器
    for (let i = idx + 1; i < counters.length; i++) {
      counters[i] = 0
    }

    // 生成编号前缀
    const prefix = counters.slice(0, idx + 1).join('.')

    // 写入 attrs.numberPrefix
    node.attrs = {
      ...(node.attrs ?? {}),
      numberPrefix: prefix,
    }
  }

  // 递归处理子节点
  if (node.content) {
    node.content = node.content.map((child) => walkAndNumber(child, counters))
  }

  return node
}
