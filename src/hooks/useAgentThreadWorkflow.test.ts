import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AgentMessage, AgentThread, AgentThreadState } from '@/types'

const listThreadsMock = vi.fn()
const createThreadMock = vi.fn()
const listMessagesMock = vi.fn()
const getThreadStateMock = vi.fn()

vi.mock('@/services/agent/AgentService', () => ({
  listThreads: (...args: unknown[]) => listThreadsMock(...args),
  createThread: (...args: unknown[]) => createThreadMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  getOrCreateThreadByBoundObject: vi.fn(),
}))

vi.mock('@/services/agent/AgentThreadStateService', () => ({
  getThreadState: (...args: unknown[]) => getThreadStateMock(...args),
}))

const { useAgentThreadWorkflow } = await import('./useAgentThreadWorkflow')

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread-1',
    projectId: 'project-1',
    title: '项目对话',
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
    ...overrides,
  }
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    role: 'assistant',
    content: '助手回复',
    structuredOutput: null,
    explanation: null,
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    agentRunId: null,
    contextPackId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeThreadState(overrides: Partial<AgentThreadState> = {}): AgentThreadState {
  return {
    id: 'state-1',
    projectId: 'project-1',
    threadId: 'thread-1',
    currentGoal: '继续写作',
    currentStep: null,
    userConstraints: [],
    acceptedDecisions: [],
    rejectedDirections: [],
    activeDocumentId: null,
    activeOutlineNodeId: null,
    lastContextPackId: null,
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderWorkflow(
  overrides: {
    projectId?: string
    agentPanelOpen?: boolean
    onErrorChange?: (error: unknown) => void
  } = {},
) {
  const onErrorChange = overrides.onErrorChange ?? vi.fn()
  const hook = renderHook(() =>
    useAgentThreadWorkflow({
      projectId: overrides.projectId ?? 'project-1',
      agentPanelOpen: overrides.agentPanelOpen ?? true,
      onErrorChange,
    }),
  )

  return { ...hook, onErrorChange }
}

describe('useAgentThreadWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listThreadsMock.mockResolvedValue({ ok: true, data: [makeThread()] })
    listMessagesMock.mockResolvedValue({ ok: true, data: [makeMessage()] })
    getThreadStateMock.mockResolvedValue({ ok: true, data: makeThreadState() })
    createThreadMock.mockResolvedValue({
      ok: true,
      data: makeThread({ id: 'thread-new', title: '新对话' }),
    })
  })

  it('面板打开时加载线程并选择首个线程，同时加载消息和线程状态', async () => {
    const { result } = renderWorkflow()

    await waitFor(() => {
      expect(result.current.currentThread?.id).toBe('thread-1')
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.threadState?.currentGoal).toBe('继续写作')
    })
    expect(listThreadsMock).toHaveBeenCalledWith('project-1')
    expect(listMessagesMock).toHaveBeenCalledWith('thread-1')
    expect(getThreadStateMock).toHaveBeenCalledWith('thread-1')
  })

  it('创建项目级新线程后选中新线程并刷新线程列表', async () => {
    const { result } = renderWorkflow()

    await waitFor(() => {
      expect(result.current.currentThread?.id).toBe('thread-1')
    })

    await act(async () => {
      await result.current.handleCreateThread()
    })

    expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      agentRole: 'writing_assistant',
      boundObjectType: 'project',
      boundObjectId: 'project-1',
      contextScope: 'whole_project',
    }))
    expect(result.current.currentThread?.id).toBe('thread-new')
    expect(listThreadsMock).toHaveBeenCalled()
  })

  it('选择线程时清理当前线程状态并清空错误', async () => {
    const onErrorChange = vi.fn()
    const { result } = renderWorkflow({ onErrorChange })
    const nextThread = makeThread({ id: 'thread-2', title: '第二个对话' })

    await waitFor(() => {
      expect(result.current.currentThread?.id).toBe('thread-1')
    })

    await act(async () => {
      result.current.handleSelectThread(nextThread)
    })

    expect(result.current.currentThread?.id).toBe('thread-2')
    expect(onErrorChange).toHaveBeenCalledWith(null)
    await waitFor(() => {
      expect(getThreadStateMock).toHaveBeenCalledWith('thread-2')
    })
  })

  it('线程加载失败时回传 AppError', async () => {
    const error = { code: 'THREAD_LIST_FAILED', message: '线程加载失败' }
    listThreadsMock.mockResolvedValueOnce({ ok: false, error })
    const onErrorChange = vi.fn()

    renderWorkflow({ onErrorChange })

    await waitFor(() => {
      expect(onErrorChange).toHaveBeenCalledWith(error)
    })
  })
})
