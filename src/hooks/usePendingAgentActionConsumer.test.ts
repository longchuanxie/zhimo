import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import type { AgentTaskType, AgentThread } from '@/types'

const createThreadMock = vi.fn()
const getOrCreateThreadByBoundObjectMock = vi.fn()

vi.mock('@/services/agent/AgentService', () => ({
  createThread: (...args: unknown[]) => createThreadMock(...args),
  getOrCreateThreadByBoundObject: (...args: unknown[]) =>
    getOrCreateThreadByBoundObjectMock(...args),
}))

const { usePendingAgentActionConsumer } = await import('./usePendingAgentActionConsumer')

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread-1',
    projectId: 'project-1',
    title: '对象线程',
    agentRole: 'writing_assistant',
    boundObjectType: 'card',
    boundObjectId: 'card-1',
    contextScope: 'current_object',
    threadSummary: null,
    status: 'active',
    messageCount: 0,
    lastMessageAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderConsumer(overrides: {
  projectId?: string
  currentThread?: AgentThread | null
  onThreadSelected?: (thread: AgentThread) => void
  onThreadReset?: () => void
  onThreadsChanged?: () => void
  onDraftPrepared?: (input: { template: string; taskType: AgentTaskType }) => void
  onPrepareSend?: (
    content: string,
    taskType: AgentTaskType,
    thread: AgentThread,
    options?: { autoSubmit?: boolean },
  ) => Promise<void>
  onError?: (error: { message: string }) => void
} = {}) {
  const callbacks = {
    onThreadSelected: overrides.onThreadSelected ?? vi.fn(),
    onThreadReset: overrides.onThreadReset ?? vi.fn(),
    onThreadsChanged: overrides.onThreadsChanged ?? vi.fn(),
    onDraftPrepared: overrides.onDraftPrepared ?? vi.fn(),
    onPrepareSend: overrides.onPrepareSend ?? vi.fn(async () => undefined),
    onError: overrides.onError ?? vi.fn(),
  }

  renderHook(() =>
    usePendingAgentActionConsumer({
      projectId: overrides.projectId ?? 'project-1',
      currentThread: overrides.currentThread ?? null,
      ...callbacks,
    }),
  )

  return callbacks
}

describe('usePendingAgentActionConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.getState().setPendingAgentAction(null)
  })

  it('对象级动作会创建或复用对象绑定线程并触发预览', async () => {
    const thread = makeThread()
    getOrCreateThreadByBoundObjectMock.mockResolvedValue({ ok: true, data: thread })
    const callbacks = renderConsumer()

    act(() => {
      useAppStore.getState().setPendingAgentAction({
        taskType: 'answer_question',
        template: '请扩展卡片「角色卡」。',
        boundObjectType: 'card',
        boundObjectId: 'card-1',
        contextScope: 'current_object',
        threadTitle: '扩展卡片：角色卡',
      })
    })

    await waitFor(() => {
      expect(callbacks.onPrepareSend).toHaveBeenCalledWith(
        '请扩展卡片「角色卡」。',
        'answer_question',
        thread,
        { autoSubmit: undefined },
      )
    })

    expect(getOrCreateThreadByBoundObjectMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      agentRole: 'writing_assistant',
      boundObjectType: 'card',
      boundObjectId: 'card-1',
      title: '扩展卡片：角色卡',
      contextScope: 'current_object',
    })
    expect(callbacks.onThreadSelected).toHaveBeenCalledWith(thread)
    expect(callbacks.onThreadReset).toHaveBeenCalledTimes(1)
    expect(callbacks.onThreadsChanged).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().pendingAgentAction).toBeNull()
  })

  it('没有当前线程时会创建项目级线程', async () => {
    const thread = makeThread({
      id: 'project-thread-1',
      boundObjectType: 'project',
      boundObjectId: 'project-1',
      contextScope: 'whole_project',
    })
    createThreadMock.mockResolvedValue({ ok: true, data: thread })
    const callbacks = renderConsumer()

    act(() => {
      useAppStore.getState().setPendingAgentAction({
        taskType: 'answer_question',
        template: '请继续分析项目。',
      })
    })

    await waitFor(() => {
      expect(createThreadMock).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'project-1',
        agentRole: 'writing_assistant',
        boundObjectType: 'project',
        boundObjectId: 'project-1',
        contextScope: 'whole_project',
      }))
    })
    expect(callbacks.onPrepareSend).toHaveBeenCalledWith(
      '请继续分析项目。',
      'answer_question',
      thread,
      { autoSubmit: undefined },
    )
  })

  it('对象级动作会透传自动提交标记，避免用户二次手动发送', async () => {
    const thread = makeThread()
    getOrCreateThreadByBoundObjectMock.mockResolvedValue({ ok: true, data: thread })
    const callbacks = renderConsumer()

    act(() => {
      useAppStore.getState().setPendingAgentAction({
        taskType: 'answer_question',
        template: '请围绕大纲节点「第一章」起草正文。',
        boundObjectType: 'outline_node',
        boundObjectId: 'node-1',
        contextScope: 'current_object',
        threadTitle: '起草：第一章',
        autoSubmit: true,
      })
    })

    await waitFor(() => {
      expect(callbacks.onPrepareSend).toHaveBeenCalledWith(
        '请围绕大纲节点「第一章」起草正文。',
        'answer_question',
        thread,
        { autoSubmit: true },
      )
    })
  })

  it('对象线程创建失败时向外返回错误', async () => {
    const error = { code: 'THREAD_ERROR', message: '线程创建失败', retryable: true }
    getOrCreateThreadByBoundObjectMock.mockResolvedValue({ ok: false, error })
    const callbacks = renderConsumer()

    act(() => {
      useAppStore.getState().setPendingAgentAction({
        taskType: 'answer_question',
        template: '请修订知识。',
        boundObjectType: 'knowledge',
        boundObjectId: 'knowledge-1',
      })
    })

    await waitFor(() => {
      expect(callbacks.onError).toHaveBeenCalledWith(error)
    })
    expect(callbacks.onPrepareSend).not.toHaveBeenCalled()
  })
})
