// Agent 工具共享辅助函数
// 提供写工具执行器的统一"待确认"返回值构造与参数校验工具

import type { PendingActionIntent } from '@/types'
import type { PendingActionCollector } from './pendingActionCollector'

/// 写工具"待确认"返回值（回传给模型，告知操作未立即执行）
export interface PendingToolResult {
  pending: true
  summary: string
  message: string
}

/// 构造写工具的"待确认"返回值
export function pendingResult(summary: string): PendingToolResult {
  return {
    pending: true,
    summary,
    message: '操作已记录，等待用户确认后执行',
  }
}

/// 收集写操作意图并返回"待确认"结果给模型
///
/// 写工具执行器的统一模式：
/// 1. 校验参数（失败直接返回 error JSON）
/// 2. 生成中文 summary
/// 3. 调用此 helper 收集意图
/// 4. 返回 pendingResult 给模型
export function collectPending(
  collector: PendingActionCollector,
  intent: PendingActionIntent,
): PendingToolResult {
  collector.add(intent)
  return pendingResult(intent.summary)
}

/// 构造错误返回值（JSON 字符串）
export function errorResult(message: string): string {
  return JSON.stringify({ error: message })
}

/// 安全读取 string 参数
export function readString(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const v = args[key]
  return typeof v === 'string' ? v : null
}

/// 安全读取非空 string 参数
export function readNonEmptyString(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const v = readString(args, key)
  return v && v.trim().length > 0 ? v : null
}

/// 安全读取 number 参数
export function readNumber(
  args: Record<string, unknown>,
  key: string,
): number | null {
  const v = args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/// 安全读取 string[] 参数
export function readStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | null {
  const v = args[key]
  if (!Array.isArray(v)) return null
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
}
