// 错误状态组件
// 统一展示错误信息，支持重试

import { useState } from 'react'
import type { AppError } from '@/types/error'
import { isRetryable, getSuggestedAction } from '@/constants/errors'
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { AppIcon } from './AppIcon'

type ErrorStateProps = {
  error: AppError
  onRetry?: () => void
  /// 自定义标题
  title?: string
}

export function ErrorState({ error, onRetry, title }: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false)
  const canRetry = isRetryable(error.code) && !!onRetry
  const suggestedAction = getSuggestedAction(error.code)

  const handleRetry = () => {
    if (!onRetry) return
    setRetrying(true)
    onRetry()
    // 重置状态由父组件数据刷新驱动
    setTimeout(() => setRetrying(false), 1000)
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-xl bg-danger-soft border border-danger/20">
        <AppIcon icon={ExclamationTriangleIcon} size="xl" className="text-danger" />
      </div>

      <h3 className="text-lg font-bold text-ink mb-2">{title ?? error.message}</h3>

      {title && error.message && title !== error.message && (
        <p className="text-sm text-muted mb-2 max-w-md">{error.message}</p>
      )}

      {/* 研发详情不展示给用户，仅展示错误码供排查 */}
      <p className="text-xs text-subtle mb-4 font-mono">错误码：{error.code}</p>

      {suggestedAction && (
        <p className="text-sm text-muted mb-4">建议：{suggestedAction}</p>
      )}

      {canRetry && (
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRetry}
          disabled={retrying}
        >
          <AppIcon
            icon={ArrowPathIcon}
            size="sm"
            className={retrying ? 'animate-spin' : ''}
          />
          {retrying ? '重试中...' : '重试'}
        </button>
      )}
    </div>
  )
}
