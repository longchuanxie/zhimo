// 智能助手面板头部
// 负责展示标题、刷新和新建对话入口。

import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'

type AgentPanelHeaderProps = {
  onRefresh: () => void
  onCreateThread: () => void
}

export function AgentPanelHeader({
  onRefresh,
  onCreateThread,
}: AgentPanelHeaderProps) {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-soft">
        <AppIcon
          icon={ChatBubbleLeftRightIcon}
          size="sm"
          className="text-brand"
        />
      </div>
      <h2 className="flex-1 text-sm font-bold text-ink">智能助手</h2>
      <button
        type="button"
        className="btn-ghost px-2 py-1"
        onClick={onRefresh}
        aria-label="刷新"
      >
        <AppIcon icon={ArrowPathIcon} size="sm" />
      </button>
      <button
        type="button"
        className="btn-ghost px-2 py-1"
        onClick={onCreateThread}
        aria-label="新对话"
      >
        <AppIcon icon={PlusIcon} size="sm" />
      </button>
    </div>
  )
}
