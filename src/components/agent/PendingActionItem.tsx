// 单条待确认操作卡片
// 展示 Agent 写工具收集的操作意图，供用户执行或拒绝
//
// 状态展示：
// - pending：显示「执行」「拒绝」按钮
// - applied：显示「已执行」状态标签
// - rejected：显示「已拒绝」状态标签
// - processing：按钮禁用，显示「正在执行...」
// - 错误：inline 显示错误文案

import {
  CheckIcon,
  XMarkIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { StatusTag } from '@/components/foundation/StatusTag'
import {
  PENDING_ACTION_STATUS_LABEL,
  getPendingActionToolLabel,
} from '@/constants/pendingActions'
import type { PendingToolAction, EntityId } from '@/types'

type PendingActionItemProps = {
  /// 操作记录
  action: PendingToolAction
  /// 点击执行
  onApply: (actionId: EntityId) => void
  /// 点击拒绝
  onReject: (actionId: EntityId) => void
  /// 是否正在处理中（apply/reject 进行中）
  processing?: boolean
  /// 错误信息（null 表示无错误）
  errorMessage?: string | null
}

export function PendingActionItem({
  action,
  onApply,
  onReject,
  processing = false,
  errorMessage = null,
}: PendingActionItemProps) {
  const isPending = action.status === 'pending'
  const toolLabel = getPendingActionToolLabel(action.toolName)
  const statusLabel = PENDING_ACTION_STATUS_LABEL[action.status]

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      {/* 头部：工具名 + 状态标签 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AppIcon
            icon={CommandLineIcon}
            size="sm"
            className="text-purple flex-shrink-0"
          />
          <span className="text-xs font-semibold text-ink truncate">
            {toolLabel}
          </span>
        </div>
        <StatusTag
          status={action.status}
          label={statusLabel}
          color={
            action.status === 'applied'
              ? 'brand'
              : action.status === 'rejected'
                ? 'default'
                : 'accent'
          }
        />
      </div>

      {/* 摘要 */}
      <p className="mt-1 text-xs text-muted leading-relaxed break-words">
        {action.summary}
      </p>

      {/* 错误提示 */}
      {errorMessage && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-danger">
          <AppIcon icon={ExclamationTriangleIcon} size="sm" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 操作按钮：仅 pending 状态显示 */}
      {isPending && (
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-brand hover:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={processing}
            onClick={() => onApply(action.id)}
          >
            <AppIcon icon={CheckIcon} size="sm" />
            {processing ? '正在执行...' : '执行'}
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={processing}
            onClick={() => onReject(action.id)}
          >
            <AppIcon icon={XMarkIcon} size="sm" />
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}
