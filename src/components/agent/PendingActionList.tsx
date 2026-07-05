// 待确认操作列表容器
// 渲染某条助手消息关联的所有待确认操作
//
// 设计说明：
// - 空列表返回 null，不渲染任何内容（避免占位空块）
// - 标题行 + 「全部执行」按钮（仅当存在 pending 项时显示）
// - 通过 usePendingActions hook 管理状态，组件本身无业务逻辑

import { useState } from 'react'
import {
  CheckIcon,
  ClipboardDocumentListIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { PendingActionItem } from '@/components/agent/PendingActionItem'
import { usePendingActions } from '@/hooks/usePendingActions'
import type { EntityId } from '@/types'

type PendingActionListProps = {
  /// 关联的助手消息 ID
  messageId: EntityId
}

export function PendingActionList({ messageId }: PendingActionListProps) {
  const {
    actions,
    loading,
    processingId,
    applyingAll,
    actionErrors,
    applyAction,
    rejectAction,
    applyAll,
  } = usePendingActions(messageId)

  const [open, setOpen] = useState(true)

  // 空列表不渲染
  if (!loading && actions.length === 0) {
    return null
  }

  // 加载中且无数据时，渲染轻量占位（避免列表区闪烁）
  if (loading && actions.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        正在加载待确认操作...
      </div>
    )
  }

  const pendingCount = actions.filter((a) => a.status === 'pending').length

  return (
    <div className="rounded-md bg-purple-soft/30 border border-purple/20 px-3 py-2 space-y-1.5">
      {/* 标题行：可点击收起/展开 */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-left flex-1 min-w-0"
          onClick={() => setOpen((v) => !v)}
        >
          <AppIcon
            icon={open ? ChevronDownIcon : ChevronRightIcon}
            size="sm"
            className="text-purple"
          />
          <AppIcon
            icon={ClipboardDocumentListIcon}
            size="sm"
            className="text-purple"
          />
          <span className="text-xs font-semibold text-purple">
            待确认操作
          </span>
          <span className="text-xs text-muted">（{actions.length} 条）</span>
        </button>
        {open && pendingCount > 0 && (
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-brand hover:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={applyingAll || processingId !== null}
            onClick={() => void applyAll()}
          >
            <AppIcon icon={CheckIcon} size="sm" />
            {applyingAll ? '正在执行...' : `全部执行（${pendingCount}）`}
          </button>
        )}
      </div>

      {/* 操作列表 */}
      {open && (
        <div className="space-y-1.5">
          {actions.map((action) => (
            <PendingActionItem
              key={action.id}
              action={action}
              onApply={(id) => void applyAction(id)}
              onReject={(id) => void rejectAction(id)}
              processing={processingId === action.id}
              errorMessage={actionErrors[action.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
