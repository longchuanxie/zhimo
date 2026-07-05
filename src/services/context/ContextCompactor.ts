// 上下文压缩器
// 当上下文 token 超过模型上限时，按优先级自动压缩/裁剪
//
// 压缩级别策略（借鉴 Claude Code auto-compact + ACON）：
// - light（70% 阈值）：排除低优先级可选条目
// - medium（85% 阈值）：截断非必选条目文本
// - aggressive（95% 阈值）：极端压缩，保护核心必选项
//
// 压缩策略（按优先级执行）：
// 1. 必选项保护：required=true 的条目不裁剪（但可截断文本）
// 2. 可选条目按优先级裁剪：低优先级（priority 数字大）的可选条目先排除
// 3. 单条截断：若仍超限，对非必选条目按 truncateLen 减半截断
// 4. 必选项截断：最后手段，对必选项的 preview 文本截断（保留 user_instruction 和 selected_text 不动）
// 5. 全局上限：确保最终 totalTokens <= maxTokens

import type { ContextEntry } from '@/types'
import { estimateTokens } from '@/utils/tokenEstimate'

/// 压缩级别
export type CompressionLevel = 'light' | 'medium' | 'aggressive'

/// 压缩级别阈值（相对于模型上下文上限）
export const COMPRESSION_THRESHOLDS: Record<CompressionLevel, number> = {
  light: 0.70,
  medium: 0.85,
  aggressive: 0.95,
}

/// 根据当前 token 使用率确定压缩级别
export function determineCompressionLevel(
  currentTokens: number,
  maxTokens: number,
): CompressionLevel | null {
  const ratio = currentTokens / maxTokens
  if (ratio >= COMPRESSION_THRESHOLDS.aggressive) return 'aggressive'
  if (ratio >= COMPRESSION_THRESHOLDS.medium) return 'medium'
  if (ratio >= COMPRESSION_THRESHOLDS.light) return 'light'
  return null
}

/// 压缩结果
export type CompactResult = {
  /// 压缩后的条目列表
  entries: ContextEntry[]
  /// 压缩后的总 token 估算
  totalTokens: number
  /// 被压缩/裁剪的条目信息（用于日志和用户提示）
  compactedItems: Array<{
    title: string
    action: 'truncated' | 'excluded'
    originalTokens: number
    newTokens: number
  }>
  /// 使用的压缩级别
  level: CompressionLevel | null
}

/// 计算条目列表的总 token
function sumTokens(entries: ContextEntry[]): number {
  return entries
    .filter((e) => !e.excluded)
    .reduce((sum, e) => sum + e.tokenEstimate, 0)
}

/// 截断文本
function truncate(text: string, maxLen: number): string {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.substring(0, maxLen) + '...'
}

/// 获取压缩级别对应的配置
function getLevelConfig(level: CompressionLevel) {
  switch (level) {
    case 'light':
      return {
        excludeLowPriority: true,
        truncateOptional: false,
        truncateRequired: false,
        targetRatio: COMPRESSION_THRESHOLDS.light,
      }
    case 'medium':
      return {
        excludeLowPriority: true,
        truncateOptional: true,
        truncateRequired: false,
        targetRatio: COMPRESSION_THRESHOLDS.medium,
      }
    case 'aggressive':
      return {
        excludeLowPriority: true,
        truncateOptional: true,
        truncateRequired: true,
        targetRatio: COMPRESSION_THRESHOLDS.aggressive,
      }
  }
}

/// 压缩上下文以适配模型上限
///
/// @param entries 上下文条目列表
/// @param maxTokens 模型上下文窗口大小（tokens）
/// @param level 压缩级别（可选，自动检测）
/// @param options 可选配置
///   - preserveRequired: 是否保护必选项不被裁剪（默认 true，aggressive 时忽略）
///   - reservedForOutput: 为输出预留的 token 数（默认 maxTokens 的 25%）
///   - priorityMap: 条目优先级映射（kind → priority，数字越小越高）
export function compactContext(
  entries: ContextEntry[],
  maxTokens: number,
  level?: CompressionLevel,
  options?: {
    preserveRequired?: boolean
    reservedForOutput?: number
    priorityMap?: Record<string, number>
  },
): CompactResult {
  // 自动检测压缩级别
  const currentTokens = sumTokens(entries)
  const autoLevel = level ?? determineCompressionLevel(currentTokens, maxTokens)
  const levelConfig = autoLevel ? getLevelConfig(autoLevel) : null
  const preserveRequired = options?.preserveRequired ?? (levelConfig?.truncateRequired ? false : true)
  const reservedForOutput = options?.reservedForOutput ?? Math.floor(maxTokens * 0.25)
  const priorityMap = options?.priorityMap ?? {}
  const targetTokens = maxTokens - reservedForOutput

  // 深拷贝条目，避免修改原数组
  const working = entries.map((e) => ({ ...e }))
  const compactedItems: CompactResult['compactedItems'] = []
  let runningTotal = sumTokens(working)

  // 若已满足上限，直接返回
  if (runningTotal <= targetTokens) {
    return {
      entries: working,
      totalTokens: runningTotal,
      compactedItems: [],
      level: null,
    }
  }

  // 若无自动级别或配置为不排除低优先级，直接进入截断策略
  if (!autoLevel || !levelConfig?.excludeLowPriority) {
    return truncateEntries(working, targetTokens, compactedItems, preserveRequired, autoLevel, runningTotal)
  }

  // 策略 1（light+）：按优先级排除可选条目（低优先级先排除）
  const optionalEntries = working
    .filter((e) => !e.required && !e.excluded)
    .sort((a, b) => {
      const pa = priorityMap[a.kind] ?? 99
      const pb = priorityMap[b.kind] ?? 99
      return pb - pa // 数字大的（低优先级）排前面，先被排除
    })

  for (const entry of optionalEntries) {
    if (runningTotal <= targetTokens) break
    if (!entry.refId) continue

    const originalTokenEstimate = entry.tokenEstimate
    entry.excluded = true
    runningTotal -= originalTokenEstimate
    compactedItems.push({
      title: entry.title,
      action: 'excluded',
      originalTokens: originalTokenEstimate,
      newTokens: 0,
    })
  }

  // 策略 2（medium+）：若仍超限，对剩余可选条目减半截断文本
  if (levelConfig.truncateOptional && runningTotal > targetTokens) {
    return truncateEntries(working, targetTokens, compactedItems, preserveRequired, autoLevel, runningTotal)
  }

  // 策略 3（aggressive）：若仍超限，截断必选项（保护 user_instruction 和 selected_text）
  if (levelConfig.truncateRequired && runningTotal > targetTokens) {
    const rulesEntries = working.filter(
      (e) =>
        e.required &&
        !e.excluded &&
        e.kind === 'project_rules',
    )
    for (const entry of rulesEntries) {
      if (runningTotal <= targetTokens) break

      const originalPreview = entry.preview
      const originalTokens = entry.tokenEstimate
      const truncatedPreview = truncate(originalPreview, 100)
      const newTokens = estimateTokens(truncatedPreview)

      entry.preview = truncatedPreview
      entry.tokenEstimate = newTokens
      runningTotal -= originalTokens - newTokens
      compactedItems.push({
        title: entry.title,
        action: 'truncated',
        originalTokens,
        newTokens,
      })
    }
  }

  return {
    entries: working,
    totalTokens: runningTotal,
    compactedItems,
    level: autoLevel,
  }
}

/// 对条目进行截断处理
function truncateEntries(
  working: ContextEntry[],
  targetTokens: number,
  compactedItems: CompactResult['compactedItems'],
  preserveRequired: boolean,
  level: CompressionLevel | null,
  runningTotal: number,
): CompactResult {
  // 先对可选条目截断
  const remainingOptional = working.filter((e) => !e.required && !e.excluded)
  for (const entry of remainingOptional) {
    if (runningTotal <= targetTokens) break

    const originalPreview = entry.preview
    const originalTokens = entry.tokenEstimate
    const halfLen = Math.max(50, Math.floor(originalPreview.length / 2))
    const truncatedPreview = truncate(originalPreview, halfLen)
    const newTokens = estimateTokens(truncatedPreview)

    entry.preview = truncatedPreview
    entry.tokenEstimate = newTokens
    runningTotal -= originalTokens - newTokens
    compactedItems.push({
      title: entry.title,
      action: 'truncated',
      originalTokens,
      newTokens,
    })
  }

  // 若仍超限且允许截断必选项，截断 project_rules
  if (preserveRequired === false && runningTotal > targetTokens) {
    const rulesEntries = working.filter(
      (e) =>
        e.required &&
        !e.excluded &&
        e.kind === 'project_rules',
    )
    for (const entry of rulesEntries) {
      if (runningTotal <= targetTokens) break

      const originalPreview = entry.preview
      const originalTokens = entry.tokenEstimate
      const truncatedPreview = truncate(originalPreview, 100)
      const newTokens = estimateTokens(truncatedPreview)

      entry.preview = truncatedPreview
      entry.tokenEstimate = newTokens
      runningTotal -= originalTokens - newTokens
      compactedItems.push({
        title: entry.title,
        action: 'truncated',
        originalTokens,
        newTokens,
      })
    }
  }

  return {
    entries: working,
    totalTokens: runningTotal,
    compactedItems,
    level,
  }
}

/// 获取条目类型的默认优先级（数字越小优先级越高）
export const DEFAULT_PRIORITY_MAP: Record<string, number> = {
  // 必选（最高）
  user_instruction: 0,
  selected_text: 1,
  project_rules: 2,
  agent_thread_state: 3,
  // 跨会话记忆（高优先级，仅次于必选项）
  agent_memory: 5,
  // 可选（按重要性递减）
  document: 10,
  source: 20,
  source_chunk: 30,
  card: 40,
  knowledge: 50,
  outline_node: 60,
  previous_message: 70,
}
