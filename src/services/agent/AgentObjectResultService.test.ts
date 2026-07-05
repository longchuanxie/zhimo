import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentThread } from '@/types'

const findThreadByBoundObjectMock = vi.fn()
const listMessagesMock = vi.fn()

vi.mock('@/services/database/agentRepository', () => ({
  findThreadByBoundObject: (...args: unknown[]) => findThreadByBoundObjectMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
}))

const { listAgentObjectResults } = await import('./AgentObjectResultService')

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread-1',
    projectId: 'project-1',
    title: '扩展卡片',
    agentRole: 'writing_assistant',
    boundObjectType: 'card',
    boundObjectId: 'card-1',
    contextScope: 'current_object',
    threadSummary: null,
    status: 'active',
    messageCount: 3,
    lastMessageAt: '2026-01-01T00:03:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:03:00.000Z',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    role: 'assistant',
    content: '助手建议内容',
    structuredOutput: null,
    explanation: null,
    contextPackId: 'context-1',
    agentRunId: 'run-1',
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2026-01-01T00:01:00.000Z',
    ...overrides,
  }
}

describe('listAgentObjectResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按对象绑定线程聚合最近已采纳助手成果', async () => {
    const thread = makeThread()
    findThreadByBoundObjectMock.mockResolvedValue(thread)
    listMessagesMock.mockResolvedValue([
      makeMessage({
        id: 'user-1',
        role: 'user',
        content: '请扩展',
        createdAt: '2026-01-01T00:00:30.000Z',
      }),
      makeMessage({
        id: 'skip-1',
        adoptionStatus: 'not_applied',
        content: '还未采纳',
        createdAt: '2026-01-01T00:01:00.000Z',
      }),
      makeMessage({
        id: 'applied-1',
        adoptionStatus: 'applied',
        content: '第一条已采纳建议',
        createdAt: '2026-01-01T00:02:00.000Z',
      }),
      makeMessage({
        id: 'saved-1',
        adoptionStatus: 'saved_as_knowledge',
        content: '第二条保存为知识',
        savedAsKnowledgeId: 'knowledge-1',
        createdAt: '2026-01-01T00:03:00.000Z',
      }),
    ])

    const result = await listAgentObjectResults({
      projectId: 'project-1',
      boundObjectType: 'card',
      boundObjectId: 'card-1',
    })

    expect(findThreadByBoundObjectMock).toHaveBeenCalledWith('project-1', 'card', 'card-1')
    expect(listMessagesMock).toHaveBeenCalledWith('thread-1', 100)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.thread).toBe(thread)
    expect(result.data.items).toEqual([
      {
        id: 'saved-1',
        threadId: 'thread-1',
        messageId: 'saved-1',
        adoptionStatus: 'saved_as_knowledge',
        contentPreview: '第二条保存为知识',
        savedAsCardId: null,
        savedAsKnowledgeId: 'knowledge-1',
        createdAt: '2026-01-01T00:03:00.000Z',
      },
      {
        id: 'applied-1',
        threadId: 'thread-1',
        messageId: 'applied-1',
        adoptionStatus: 'applied',
        contentPreview: '第一条已采纳建议',
        savedAsCardId: null,
        savedAsKnowledgeId: null,
        createdAt: '2026-01-01T00:02:00.000Z',
      },
    ])
  })

  it('没有绑定线程时返回空成果', async () => {
    findThreadByBoundObjectMock.mockResolvedValue(null)

    const result = await listAgentObjectResults({
      projectId: 'project-1',
      boundObjectType: 'source',
      boundObjectId: 'source-1',
    })

    expect(result).toEqual({ ok: true, data: { thread: null, items: [] } })
    expect(listMessagesMock).not.toHaveBeenCalled()
  })

  it('校验对象 ID', async () => {
    const result = await listAgentObjectResults({
      projectId: 'project-1',
      boundObjectType: 'knowledge',
      boundObjectId: '   ',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('对象 ID 不能为空')
  })
})
