import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentThreadState } from '@/types'

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

const { updateThreadStateFromContext } = await import('./AgentThreadStateService')

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

beforeEach(() => {
  vi.clearAllMocks()
  upsertThreadStateMock.mockImplementation(async (input) => makeState(input))
})

describe('AgentThreadStateService references', () => {
  it('clears stale foreign-key references before upserting thread state', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(
      makeState({
        activeDocumentId: 'old-missing-doc',
        activeOutlineNodeId: 'old-missing-node',
        lastContextPackId: 'old-missing-pack',
      }),
    )
    findDocumentByIdMock.mockResolvedValue(null)
    findOutlineNodeByIdMock.mockResolvedValue(null)
    findContextPackByIdMock.mockResolvedValue(null)

    const result = await updateThreadStateFromContext({
      projectId: 'p1',
      threadId: 't1',
      contextPackId: 'missing-pack',
      taskType: 'answer_question',
      userInstruction: '继续写第二集正文',
      boundObjectType: 'document',
      boundObjectId: 'missing-doc',
    })

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeDocumentId: null,
        activeOutlineNodeId: null,
        lastContextPackId: null,
      }),
    )
  })

  it('keeps only references that belong to the current project', async () => {
    findThreadStateByThreadIdMock.mockResolvedValue(null)
    findDocumentByIdMock.mockResolvedValue({ id: 'doc-1', projectId: 'other' })
    findOutlineNodeByIdMock.mockResolvedValue(null)
    findContextPackByIdMock.mockResolvedValue({ id: 'cp-1', projectId: 'p1' })

    const result = await updateThreadStateFromContext({
      projectId: 'p1',
      threadId: 't1',
      contextPackId: 'cp-1',
      taskType: 'answer_question',
      userInstruction: '继续写第二集正文',
      currentDocumentId: 'doc-1',
    })

    expect(result.ok).toBe(true)
    expect(upsertThreadStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeDocumentId: null,
        lastContextPackId: 'cp-1',
      }),
    )
  })
})
