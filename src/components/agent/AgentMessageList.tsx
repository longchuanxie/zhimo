// 智能助手消息列表
// 从 AgentPanel 拆分，负责消息列表渲染（含空状态、加载状态）

import { useRef, useEffect } from 'react'
import {
  ChatBubbleLeftRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { AgentMessageItem } from '@/components/agent/AgentMessageItem'
import type { AgentMessage, AgentThread } from '@/types'

type AgentMessageListProps = {
  /// 当前线程
  currentThread: AgentThread | null
  /// 消息列表
  messages: AgentMessage[]
  /// 是否正在加载
  loading: boolean
  /// 创建新线程
  onCreateThread: () => void
  /// 消息操作回调
  onAdopt: (message: AgentMessage) => void
  onReject: (message: AgentMessage) => void
  onSaveAsCard: (message: AgentMessage) => void
  onSaveAsKnowledge: (message: AgentMessage) => void
}

export function AgentMessageList({
  currentThread,
  messages,
  loading,
  onCreateThread,
  onAdopt,
  onReject,
  onSaveAsCard,
  onSaveAsKnowledge,
}: AgentMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <LoadingState message="正在加载..." />
      </div>
    )
  }

  if (!currentThread) {
    return (
      <div className="flex-1 overflow-auto">
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title="还没有助手对话"
          description="创建一个新对话即可开始与智能助手协作。助手会基于当前项目的资料、卡片、大纲和知识提供写作建议。"
          primaryAction={{
            label: '新建对话',
            icon: PlusIcon,
            onClick: onCreateThread,
          }}
          hint="AI 输出不会直接覆盖正文，需要你确认后才会应用"
        />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title="开始对话"
          description="输入问题或使用快捷动作，助手会基于项目上下文提供帮助。"
          hint={`当前对话：${currentThread.title}`}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="py-2">
        {messages.map((message) => (
          <AgentMessageItem
            key={message.id}
            message={message}
            onAdopt={onAdopt}
            onReject={onReject}
            onSaveAsCard={onSaveAsCard}
            onSaveAsKnowledge={onSaveAsKnowledge}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
