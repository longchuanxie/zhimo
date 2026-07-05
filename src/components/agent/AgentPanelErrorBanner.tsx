// 智能助手错误提示条
// 负责将 AppError 转换为面板内的用户可见提示。
import type { AppError } from '@/types/error'

type AgentPanelErrorBannerProps = {
  error: AppError | null
}

export function AgentPanelErrorBanner({
  error,
}: AgentPanelErrorBannerProps) {
  if (!error) return null

  return (
    <div className="mx-3 mt-2 rounded-md bg-danger-soft border border-danger/20 px-3 py-2">
      <p className="text-xs text-danger">{formatErrorDisplay(error)}</p>
    </div>
  )
}

function formatErrorDisplay(error: AppError): string {
  const detail = error.detail ? ` (${String(error.detail)})` : ''
  return `[${error.code}] ${error.message}${detail}`
}
