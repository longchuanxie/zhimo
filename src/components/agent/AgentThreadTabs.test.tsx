import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AgentThreadTabs } from './AgentThreadTabs'
import type { AgentThread } from '@/types'

function makeThread(id: string, title: string): AgentThread {
  return {
    id,
    projectId: 'project-1',
    title,
    agentRole: 'writing_assistant',
    boundObjectType: 'project',
    boundObjectId: 'project-1',
    contextScope: 'whole_project',
    threadSummary: null,
    status: 'active',
    messageCount: 0,
    lastMessageAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('AgentThreadTabs', () => {
  it('只有一个线程时不渲染切换器', () => {
    const { container } = render(
      <AgentThreadTabs
        threads={[makeThread('thread-1', '默认对话')]}
        currentThreadId="thread-1"
        onSelectThread={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('渲染多个线程并触发选择', () => {
    const onSelectThread = vi.fn()
    const first = makeThread('thread-1', '默认对话')
    const second = makeThread('thread-2', '资料核查')

    render(
      <AgentThreadTabs
        threads={[first, second]}
        currentThreadId="thread-1"
        onSelectThread={onSelectThread}
      />,
    )

    fireEvent.click(screen.getByText('资料核查'))
    expect(onSelectThread).toHaveBeenCalledWith(second)
  })
})
