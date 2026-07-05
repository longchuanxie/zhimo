import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentConversationArea } from './AgentConversationArea'
import type { AgentThread } from '@/types'

vi.mock('@/components/agent/AgentMessageList', () => ({
  AgentMessageList: ({ currentThread }: { currentThread: AgentThread | null }) => (
    <div data-testid="message-list">
      {currentThread ? currentThread.title : '没有对话'}
    </div>
  ),
}))

vi.mock('@/components/agent/AgentQuickActions', () => ({
  AgentQuickActions: () => <div data-testid="quick-actions">快捷动作</div>,
}))

vi.mock('@/components/agent/AgentInputArea', () => ({
  AgentInputArea: () => <div data-testid="input-area">输入区</div>,
}))

const baseThread: AgentThread = {
  id: 'thread-1',
  projectId: 'project-1',
  agentRole: 'writing_assistant',
  boundObjectType: 'project',
  boundObjectId: 'project-1',
  title: '项目对话',
  contextScope: 'whole_project',
  status: 'active',
  threadSummary: null,
  messageCount: 0,
  lastMessageAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function renderArea(currentThread: AgentThread | null) {
  render(
    <AgentConversationArea
      messageList={{
        currentThread,
        messages: [],
        loading: false,
        onCreateThread: vi.fn(),
        onAdopt: vi.fn(),
        onReject: vi.fn(),
        onSaveAsCard: vi.fn(),
        onSaveAsKnowledge: vi.fn(),
      }}
      quickActions={{
        hasSelection: false,
        onAction: vi.fn(),
      }}
      inputArea={{
        input: '',
        onInputChange: vi.fn(),
        taskType: 'answer_question',
        onClearTaskType: vi.fn(),
        onSend: vi.fn(),
        sending: false,
        previewLoading: false,
      }}
    />,
  )
}

describe('AgentConversationArea', () => {
  it('有当前对话时展示消息列表、快捷动作和输入区', () => {
    renderArea(baseThread)

    expect(screen.getByTestId('message-list')).toHaveTextContent('项目对话')
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument()
    expect(screen.getByTestId('input-area')).toBeInTheDocument()
  })

  it('没有当前对话时仅展示消息列表空状态入口', () => {
    renderArea(null)

    expect(screen.getByTestId('message-list')).toHaveTextContent('没有对话')
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('input-area')).not.toBeInTheDocument()
  })
})
