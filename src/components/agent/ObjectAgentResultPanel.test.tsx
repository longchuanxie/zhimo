import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const listAgentObjectResultsMock = vi.fn()

vi.mock('@/services/agent/AgentObjectResultService', () => ({
  listAgentObjectResults: (...args: unknown[]) => listAgentObjectResultsMock(...args),
}))

const { ObjectAgentResultPanel } = await import('./ObjectAgentResultPanel')

describe('ObjectAgentResultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('展示当前对象的助手成果', async () => {
    listAgentObjectResultsMock.mockResolvedValue({
      ok: true,
      data: {
        thread: {
          id: 'thread-1',
          title: '扩展卡片',
        },
        items: [
          {
            id: 'result-1',
            threadId: 'thread-1',
            messageId: 'msg-1',
            adoptionStatus: 'saved_as_card',
            contentPreview: '这是一条已保存为卡片的助手成果',
            savedAsCardId: 'card-2',
            savedAsKnowledgeId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })

    render(
      <ObjectAgentResultPanel
        projectId="project-1"
        objectType="card"
        objectId="card-1"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('已存为卡片')).toBeInTheDocument()
    })

    expect(screen.getByText('助手成果')).toBeInTheDocument()
    expect(screen.getByText('扩展卡片')).toBeInTheDocument()
    expect(screen.getByText('这是一条已保存为卡片的助手成果')).toBeInTheDocument()
    expect(screen.getByText('卡片 ID：card-2')).toBeInTheDocument()
  })

  it('没有成果时展示空状态提示', async () => {
    listAgentObjectResultsMock.mockResolvedValue({
      ok: true,
      data: { thread: null, items: [] },
    })

    render(
      <ObjectAgentResultPanel
        projectId="project-1"
        objectType="source"
        objectId="source-1"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/暂无已采纳的助手成果/)).toBeInTheDocument()
    })
  })
})
