// 任务进度项
// 对应任务：DEV-090
//
// 职责：展示单个任务的进度、状态、错误信息，提供重试/取消操作

import {
  ArrowPathIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { StatusTag } from '@/components/foundation/StatusTag'
import {
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  getStatusColor,
} from '@/constants/status'
import type { Task } from '@/types'

type Props = {
  task: Task
  onRetry?: (task: Task) => void
  onCancel?: (task: Task) => void
}

export function TaskProgressItem({ task, onRetry, onCancel }: Props) {
  const typeLabel = TASK_TYPE_LABEL[task.taskType] ?? task.taskType
  const statusLabel = TASK_STATUS_LABEL[task.status]
  const statusColor = getStatusColor(task.status)

  const canRetry = task.status === 'failed' || task.status === 'cancelled'
  const canCancel = task.status === 'pending' || task.status === 'running'

  return (
    <div className="px-3 py-2.5 border-b border-line">
      <div className="flex items-center gap-2 mb-1">
        {/* 状态图标 */}
        {task.status === 'succeeded' && (
          <AppIcon icon={CheckCircleIcon} size="sm" className="text-success flex-shrink-0" />
        )}
        {task.status === 'failed' && (
          <AppIcon icon={ExclamationCircleIcon} size="sm" className="text-danger flex-shrink-0" />
        )}
        {task.status === 'running' && (
          <div className="h-3 w-3 rounded-full border-2 border-brand border-t-transparent animate-spin flex-shrink-0" />
        )}
        {task.status === 'pending' && (
          <div className="h-3 w-3 rounded-full bg-subtle flex-shrink-0" />
        )}
        {task.status === 'cancelled' && (
          <AppIcon icon={XMarkIcon} size="sm" className="text-subtle flex-shrink-0" />
        )}

        {/* 任务类型 */}
        <span className="text-sm text-ink flex-1 truncate">{typeLabel}</span>

        {/* 状态标签 */}
        <StatusTag status={task.status} label={statusLabel} color={statusColor} />
      </div>

      {/* 进度条（仅 running/pending 时显示） */}
      {(task.status === 'running' || task.status === 'pending') && (
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}

      {/* 错误信息 */}
      {task.errorMessage && (
        <p className="text-xs text-danger mt-1 line-clamp-2">{task.errorMessage}</p>
      )}

      {/* 时间与操作 */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-subtle">
          {new Date(task.createdAt).toLocaleString('zh-CN')}
        </span>
        <div className="flex items-center gap-1">
          {canRetry && onRetry && (
            <button
              type="button"
              className="btn-ghost px-1.5 py-0.5 text-xs"
              onClick={() => onRetry(task)}
              title="重试"
            >
              <AppIcon icon={ArrowPathIcon} size="sm" />
              重试
            </button>
          )}
          {canCancel && onCancel && (
            <button
              type="button"
              className="btn-ghost px-1.5 py-0.5 text-xs"
              onClick={() => onCancel(task)}
              title="取消"
            >
              <AppIcon icon={XMarkIcon} size="sm" />
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
