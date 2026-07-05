// Token 估算工具
// 中文 1 字 ≈ 1 token，英文 4 字符 ≈ 1 token
// 供 AgentService / ContextService / ContextCompactor / ContextSummarizer 共用

/// 估算文本 token 数
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length
  const otherChars = text.length - cjkCount
  return cjkCount + Math.ceil(otherChars / 4)
}
