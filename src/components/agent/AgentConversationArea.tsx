// 智能助手对话区
// 负责组合消息列表、快捷动作和输入区，不承接数据加载或发送编排。
import { AgentMessageList } from '@/components/agent/AgentMessageList'
import { AgentQuickActions } from '@/components/agent/AgentQuickActions'
import type { QuickAction } from '@/components/agent/AgentQuickActions'
import { AgentInputArea } from '@/components/agent/AgentInputArea'
import type { AgentMessage, AgentTaskType, AgentThread } from '@/types'

type MessageListConfig = {
  currentThread: AgentThread | null
  messages: AgentMessage[]
  loading: boolean
  onCreateThread: () => void
  onAdopt: (message: AgentMessage) => void
  onReject: (message: AgentMessage) => void
  onSaveAsCard: (message: AgentMessage) => void
  onSaveAsKnowledge: (message: AgentMessage) => void
}

type QuickActionsConfig = {
  hasSelection: boolean
  onAction: (action: QuickAction) => void
}

type InputAreaConfig = {
  input: string
  onInputChange: (value: string) => void
  taskType: AgentTaskType
  onClearTaskType: () => void
  onSend: () => void
  sending: boolean
  previewLoading: boolean
}

type AgentConversationAreaProps = {
  messageList: MessageListConfig
  quickActions: QuickActionsConfig
  inputArea: InputAreaConfig
}

export function AgentConversationArea({
  messageList,
  quickActions,
  inputArea,
}: AgentConversationAreaProps) {
  const hasThread = Boolean(messageList.currentThread)

  return (
    <>
      <AgentMessageList {...messageList} />

      {hasThread && <AgentQuickActions {...quickActions} />}

      {hasThread && <AgentInputArea {...inputArea} />}
    </>
  )
}
