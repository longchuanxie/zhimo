// 自动保存指示器
// 显示当前保存状态

import { CheckCircleIcon, CloudArrowUpIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import type { AutosaveStatus } from './useEditorAutosave'

type AutosaveIndicatorProps = {
  status: AutosaveStatus
  wordCount: number
}

export function AutosaveIndicator({ status, wordCount }: AutosaveIndicatorProps) {
  const statusConfig = {
    idle: null,
    saving: {
      icon: CloudArrowUpIcon,
      text: '保存中...',
      color: 'text-muted',
    },
    saved: {
      icon: CheckCircleIcon,
      text: '已保存',
      color: 'text-brand',
    },
    failed: {
      icon: ExclamationCircleIcon,
      text: '保存失败',
      color: 'text-danger',
    },
  } as const

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-subtle">
      {/* 字数统计 */}
      <span>
        {wordCount.toLocaleString()} 字
      </span>

      {/* 保存状态 */}
      {config && (
        <span className={`flex items-center gap-1 ${config.color}`}>
          <AppIcon icon={config.icon} size="xs" />
          {config.text}
        </span>
      )}
    </div>
  )
}
