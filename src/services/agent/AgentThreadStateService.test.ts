// AgentThreadStateService 单元测试
// 覆盖多轮工作状态的目标更新、采纳/拒绝记录与上下文预览。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentThreadState } from '@/types'

const findThreadStateByThreadIdMock = vi.fn()
const upsertThreadStateMock = vi.fn()
const findDocumentByIdMock = vi.fn()
const findOutlineNodeByIdMock = vi.fn()
const findContextPackByIdMock = vi.fn()

vi.mock('@/services/database/agentThreadStateRepository', () => ({
  findThreadStateByThreadId: (...args: unknown[]) =>
    findThreadStateByThreadIdMock(...args),
  upsertThreadState: (...args: unknown[]) => upsertThreadStateMock(...args),
}))

vi.mock('@/services/database/documentRepository', () => ({
  findDocumentById: (...args: unknown[]) => findDocumentByIdMock(...args),
}))

vi.mock('@/services/database/outlineRepository', () => ({
  findOutlineNodeById: (...args: unknown[]) => findOutlineNodeByIdMock(...args),
}))

vi.mock('@/services/database/contextRepository', () => ({
  findContextPackById: (...args: unknown[]) => findContextPackByIdMock(...args),
}))

const {
  buildThreadStatePreview,
  recordAcceptedDecision,
  recordWritingIntentClarification,
  findPendingWritingIntentClarification,
  recordRejectedDirection,
  updateThreadStateFromContext,
} = await import('./AgentThreadStateService')

function makeState(overrides: Partial<AgentThreadState> = {}): AgentThreadState {
  return {
    id: 'state-1',
    projectId: 'p1',
    threadId: 't1',
    currentGoal: null,
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

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    threadId: 't1',
    projectId: 'p1',
    role: 'assistant',
    content: '第一集正文内容',
    structuredOutput: null,
    explanation: null,
    contextPackId: 'cp-1',
    agentRunId: 'run-1',
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertThreadStateMock.mockImplementation(async (input) => makeState(input))
  findDocumentByIdMock.mockImplementation(async (id) => ({ id, projectId: 'p1' }))
  findOutlineNodeByIdMock.mockImplementation(async (id) => ({
    id,
    projectId: 'p1',
  }))
  findContextPackByIdMock.mockImplementation(async (id) => ({
    id,
    projectId: 'p1',
  }))
})

describe('AgentThreadStateService', () => {
  it('根据 ContextPack 输入更新当前目标、步骤和活跃文档', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(null)

    const result = await updateThreadStateFromContext({
      projectId: 'p1',
      threadId: 't1',
      contextPackId: 'cp-1',
      taskType: 'answer_question',
      userInstruction: '请完成第一卷第1集的正文编写',
      currentDocumentId: 'doc-1',
    })

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        threadId: 't1',
        currentGoal: '请完成第一卷第1集的正文编写',
        currentStep: '正在自由协作',
        activeDocumentId: 'doc-1',
        lastContextPackId: 'cp-1',
      }),
    )
  })

  it('采纳后追加已采纳决策摘要', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(makeState())

    const result = await recordAcceptedDecision({
      message: makeMessage(),
      destination: 'document',
      title: null,
    })

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedDecisions: [expect.stringContaining('已采纳到正文')],
        currentStep: '已采纳，等待下一步',
      }),
    )
  })

  it('拒绝后追加已拒绝方向摘要', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(makeState())

    const result = await recordRejectedDirection(
      makeMessage({ content: '这个版本偏大纲，不是正文' }),
    )

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectedDirections: [expect.stringContaining('已拒绝')],
        currentStep: '用户拒绝上一版方向，需要调整',
      }),
    )
  })

  it('记录正文处理方式澄清并可读取待确认目标', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(makeState())

    const result = await recordWritingIntentClarification({
      projectId: 'p1',
      threadId: 't1',
      contextPackId: 'cp-1',
      targetLabel: '第2集',
      documentId: 'doc-2',
      outlineNodeId: 'node-2',
    })

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentGoal: '完成第2集正文编写',
        currentStep: '等待用户确认正文处理方式',
        activeDocumentId: 'doc-2',
        activeOutlineNodeId: 'node-2',
        unresolvedQuestions: [
          expect.stringContaining('writing_intent_clarification:'),
        ],
      }),
    )

    const state = makeState({
      unresolvedQuestions: [
        'writing_intent_clarification:{"targetLabel":"第2集","documentId":"doc-2","outlineNodeId":"node-2"}',
      ],
    })
    expect(findPendingWritingIntentClarification(state)).toEqual({
      targetLabel: '第2集',
      documentId: 'doc-2',
      outlineNodeId: 'node-2',
    })
  })

  it('构建可注入 ContextPack 的中文状态摘要', () => {
    const preview = buildThreadStatePreview(
      makeState({
        currentGoal: '写第一卷第1集正文',
        currentStep: '已采纳，等待下一步',
        unresolvedQuestions: [
          'writing_intent_clarification:{"targetLabel":"第2集","documentId":"doc-2","outlineNodeId":"node-2"}',
        ],
        acceptedDecisions: ['已采纳到正文：开场段落'],
        rejectedDirections: ['已拒绝：大纲版本'],
      }),
    )

    expect(preview).toContain('当前目标：写第一卷第1集正文')
    expect(preview).toContain('已采纳：已采纳到正文：开场段落')
    expect(preview).toContain('已拒绝方向：已拒绝：大纲版本')
    expect(preview).toContain('待澄清：待确认第2集正文处理方式')
  })
})
