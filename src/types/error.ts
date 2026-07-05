// 应用错误类型定义

export interface AppError {
  /// 错误码：对应 errors.ts 中的 ERROR_MAP
  code: string
  /// 中文提示：直接展示给用户
  message: string
  /// 研发详情：不展示给用户，用于调试
  detail?: unknown
  /// 是否可重试
  retryable?: boolean
  /// 建议动作
  suggestedAction?: string
}
