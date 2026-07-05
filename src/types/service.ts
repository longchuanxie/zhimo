// Service 层统一返回结构
// 所有 Service 方法返回 ServiceResult<T>，不抛异常给 UI

import type { AppError } from './error'

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError }

/// 成功结果构造器
export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data }
}

/// 失败结果构造器
export function err<T>(error: AppError): ServiceResult<T> {
  return { ok: false, error }
}

/// 从未知错误构造 AppError
///
/// 将原始错误信息保留在 detail 中，便于 UI 展示与控制台排查。
export function fromUnknown(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || '出现未知错误',
      detail: error.stack ?? error.message,
      retryable: true,
    }
  }

  // 处理数据库/网络层返回的 { code, message } 形态对象
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    const rawMessage = (error as { message: string }).message
    return {
      code: 'UNKNOWN_ERROR',
      message: rawMessage || '出现未知错误',
      detail: JSON.stringify(error),
      retryable: true,
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: '出现未知错误',
    detail: typeof error === 'string' ? error : JSON.stringify(error),
    retryable: true,
  }
}
