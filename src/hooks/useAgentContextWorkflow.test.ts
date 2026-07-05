import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AgentTaskType, AgentThread, ContextPreview } from '@/types'

const getTaskContextLengthMock = vi.fn()
const sendMessageMock = vi.fn()
const previewContextMock = vi.fn()
const createContextPackMock = vi.fn()

vi.mock('@/services/agent/AgentService', () => ({
  getTaskContextLength: (...args: unknown[]) => getTaskContextLengthMock(...args),
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}))

vi.mock('@/services/context/ContextService', () => ({
  previewContext: (...args: unknown[]) => previewContextMock(...args),
  createContextPack: (...args: unknown[]) => createContextPackMock(...args),
}))

const { useAgentContextWorkflow } = await import('./useAgentContextWorkflow')

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread-1',
    projectId: 'project-1',
    title: '当前对话',
    agentRole: 'writing_assistant',
    boundObjectType: 'document',
    boundObjectId: 'doc-1',
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

function makePreview(overrides: Partial<ContextPreview> = {}): ContextPreview {
  return {
    projectId: 'project-1',
    threadId: 'thread-1',
    taskType: 'rewrite',
    userInstruction: '请改写当前选区',
    selectedText: '原文',
    currentDocumentId: 'doc-1',
    boundObjectType: 'document',
    boundObjectId: 'doc-1',
    contextScope: 'current_object',
    entries: [
      {
        kind: 'selected_text',
        refId: null,
        title: '当前选区',
        preview: '原文',
        tokenEstimate: 10,
        required: true,
        excluded: false,
      },
      {
        kind: 'card',
        refId: 'optional-1',
        title: '可选卡片',
        preview: '参考内容',
        tokenEstimate: 20,
        required: false,
        excluded: false,
      },
    ],
    totalTokenEstimate: 30,
    projectRulesSnapshot: null,
    ...overrides,
  }
}

function renderWorkflow(overrides: {
  thread?: AgentThread | null
  input?: string
  onInputChange?: (value: string) => void
  onTaskTypeChange?: (taskType: AgentTaskType) => void
  onMessagesChanged?: () => void
  onThreadsChanged?: () => void
  onErrorChange?: (error: unknown) => void
} = {}) {
  const callbacks = {
    onInputChange: overrides.onInputChange ?? vi.fn(),
    onTaskTypeChange: overrides.onTaskTypeChange ?? vi.fn(),
    onMessagesChanged: overrides.onMessagesChanged ?? vi.fn(),
    onThreadsChanged: overrides.onThreadsChanged ?? vi.fn(),
    onErrorChange: overrides.onErrorChange ?? vi.fn(),
  }

  const hook = renderHook(() =>
    useAgentContextWorkflow({
      projectId: 'project-1',
      currentThread: overrides.thread ?? makeThread(),
      input: overrides.input ?? '请改写当前选区',
      currentTaskType: 'rewrite',
      selectedText: '原文',
      activeDocumentId: 'doc-1',
      ...callbacks,
    }),
  )

  return { ...hook, callbacks }
}

describe('useAgentContextWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTaskContextLengthMock.mockResolvedValue(4000)
    previewContextMock.mockResolvedValue({ ok: true, data: makePreview() })
    createContextPackMock.mockResolvedValue({ ok: true, data: { id: 'context-pack-1' } })
    sendMessageMock.mockResolvedValue({ ok: true, data: {} })
  })

  it('prepareSend 创建上下文预览并传入线程与选区信息', async () => {
    const { result } = renderWorkflow()

    await act(async () => {
      await result.current.prepareSend('请改写当前选区', 'rewrite')
    })

    expect(getTaskContextLengthMock).toHaveBeenCalledWith('rewrite')
    expect(previewContextMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      threadId: 'thread-1',
      taskType: 'rewrite',
      boundObjectType: 'document',
      boundObjectId: 'doc-1',
      contextScope: 'current_object',
      userInstruction: '请改写当前选区',
      selectedText: '原文',
      modelMaxTokens: 4000,
      currentDocumentId: 'doc-1',
    })
    expect(result.current.contextPreview?.userInstruction).toBe('请改写当前选区')
  })

  it('confirmContextPack 成功后创建快照、发送消息并清理输入状态', async () => {
    const { result, callbacks } = renderWorkflow()

    await act(async () => {
      await result.current.prepareSend()
    })
    await act(async () => {
      await result.current.confirmContextPack(['optional-1'])
    })

    expect(createContextPackMock).toHaveBeenCalledWith(expect.objectContaining({
      userConfirmed: true,
      entries: [
        expect.objectContaining({ title: '当前选区', excluded: false }),
        expect.objectContaining({ title: '可选卡片', excluded: true }),
      ],
    }))
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      threadId: 'thread-1',
      content: '请改写当前选区',
      contextPackId: 'context-pack-1',
      taskType: 'rewrite',
      signal: expect.any(AbortSignal),
    }))
    expect(callbacks.onInputChange).toHaveBeenCalledWith('')
    expect(callbacks.onTaskTypeChange).toHaveBeenCalledWith('answer_question')
    expect(callbacks.onMessagesChanged).toHaveBeenCalledTimes(1)
    expect(callbacks.onThreadsChanged).toHaveBeenCalledTimes(1)
    expect(result.current.contextPreview).toBeNull()
  })

  it('prepareSend 开启 autoSubmit 时会自动创建快照并发送消息', async () => {
    const thread = makeThread({
      id: 'outline-thread-1',
      boundObjectType: 'outline_node',
      boundObjectId: 'node-1',
      contextScope: 'current_object',
    })
    previewContextMock.mockResolvedValueOnce({
      ok: true,
      data: makePreview({
        threadId: 'outline-thread-1',
        taskType: 'answer_question',
        userInstruction: '请围绕大纲节点「第一章」起草正文。',
        selectedText: null,
        currentDocumentId: null,
        boundObjectType: 'outline_node',
        boundObjectId: 'node-1',
      }),
    })
    const { result, callbacks } = renderWorkflow({
      thread,
      input: '',
    })

    await act(async () => {
      await result.current.prepareSend(
        '请围绕大纲节点「第一章」起草正文。',
        'answer_question',
        thread,
        { autoSubmit: true },
      )
    })

    expect(previewContextMock).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'outline-thread-1',
      taskType: 'answer_question',
      boundObjectType: 'outline_node',
      boundObjectId: 'node-1',
      userInstruction: '请围绕大纲节点「第一章」起草正文。',
    }))
    expect(createContextPackMock).toHaveBeenCalledWith(expect.objectContaining({
      userInstruction: '请围绕大纲节点「第一章」起草正文。',
      userConfirmed: true,
    }))
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      threadId: 'outline-thread-1',
      content: '请围绕大纲节点「第一章」起草正文。',
      contextPackId: 'context-pack-1',
      taskType: 'answer_question',
    }))
    expect(callbacks.onMessagesChanged).toHaveBeenCalledTimes(1)
    expect(callbacks.onThreadsChanged).toHaveBeenCalledTimes(1)
    expect(result.current.contextPreview).toBeNull()
  })

  it('发送时上下文压缩失败会保留预览并返回中文引导错误', async () => {
    sendMessageMock.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MODEL_CONTEXT_COMPACT_FAILED',
        message: 'raw failure',
        retryable: false,
      },
    })
    const { result, callbacks } = renderWorkflow()

    await act(async () => {
      await result.current.prepareSend()
    })
    await act(async () => {
      await result.current.confirmContextPack([])
    })

    await waitFor(() => {
      expect(callbacks.onErrorChange).toHaveBeenLastCalledWith({
        code: 'MODEL_CONTEXT_COMPACT_FAILED',
        message: '上下文过大，自动压缩后仍超出模型上限。请在下方预览中排除部分可选内容后重试。',
        retryable: false,
      })
    })
    expect(result.current.contextPreview).not.toBeNull()
    expect(callbacks.onInputChange).not.toHaveBeenCalledWith('')
  })
})
