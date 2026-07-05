// 字数统计工具
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §10
// 规则：中文字符数 + 英文词数

/// 统计字数
/// 中文按字符计数，英文按单词计数
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0

  // 中文字符数
  const zhChars = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0

  // 非中文部分按空格分词
  const nonZhText = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim()
  const nonZhWords =
    nonZhText.length > 0
      ? nonZhText.split(/\s+/).filter(Boolean).length
      : 0

  return zhChars + nonZhWords
}
