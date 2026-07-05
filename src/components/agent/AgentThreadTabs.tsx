// 智能助手线程切换器
// 仅负责渲染多个对话线程的横向切换入口。

import type { AgentThread } from '@/types'

type AgentThreadTabsProps = {
  threads: AgentThread[]
  currentThreadId?: string
  onSelectThread: (thread: AgentThread) => void
}

export function AgentThreadTabs({
  threads,
  currentThreadId,
  onSelectThread,
}: AgentThreadTabsProps) {
  if (threads.length <= 1) return null

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2">
      {threads.map((thread) => {
        const active = currentThreadId === thread.id
        return (
          <button
            key={thread.id}
            type="button"
            className={`rounded px-2 py-1 text-xs whitespace-nowrap transition-colors ${
              active
                ? 'bg-ink text-white'
                : 'border border-line bg-surface text-muted hover:bg-surface-2'
            }`}
            onClick={() => onSelectThread(thread)}
          >
            {thread.title}
          </button>
        )
      })}
    </div>
  )
}
