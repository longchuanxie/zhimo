import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Document, OutlineNode } from '@/types'
import type { ServiceResult } from '@/types/service'

const getOutlineMock = vi.fn()
const listDocumentsMock = vi.fn()
const getDocumentMock = vi.fn()
const getThreadStateMock = vi.fn()

vi.mock('@/services/outline/OutlineService', () => ({
  getOutline: (...args: unknown[]) => getOutlineMock(...args),
}))

vi.mock('@/services/document/DocumentService', () => ({
  listDocuments: (...args: unknown[]) => listDocumentsMock(...args),
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}))

vi.mock('@/services/agent/AgentThreadStateService', () => ({
  getThreadState: (...args: unknown[]) => getThreadStateMock(...args),
  findPendingWritingIntentClarification: (state: {
    unresolvedQuestions: string[]
  } | null) => {
    const marker = state?.unresolvedQuestions.find((item) =>
      item.startsWith('writing_intent_clarification:'),
    )
    if (!marker) return null
    return JSON.parse(marker.slice('writing_intent_clarification:'.length))
  },
}))

const {
  analyzeEpisodeWritingIntent,
  parseEpisodeWritingIntent,
} = await import('./WritingIntentService')

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data }
}

function makeNode(overrides: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id: 'node-2',
    projectId: 'proj-1',
    outlineId: 'outline-1',
    parentId: null,
    title: '第2集 暑假第二天',
    description: '写小樱桃去外婆家的经历',
    status: 'draft',
    sortOrder: 2,
    depth: 1,
    linkedDocumentId: null,
    targetWordCount: 2000,
    currentWordCount: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-2',
    projectId: 'proj-1',
    title: '第2集 暑假第二天',
    type: 'normal',
    contentJson: null,
    plainText: '',
    wordCount: 0,
    outlineNodeId: null,
    status: 'draft',
    summary: null,
    lastEditedAt: null,
    citationStyle: 'gbt7714_2015',
    isDeleted: false,
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('WritingIntentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('识别“完成第2集正文编写”意图', () => {
    expect(parseEpisodeWritingIntent('接下来完成第2集的正文编写')).toEqual({
      episodeNumber: 2,
      targetLabel: '第2集',
    })
    expect(parseEpisodeWritingIntent('请完成第二集正文写作')).toEqual({
      episodeNumber: 2,
      targetLabel: '第2集',
    })
  })

  it('已有非空文档时返回澄清问题', async () => {
    const node = makeNode()
    const document = makeDocument({
      outlineNodeId: node.id,
      plainText: '已有正文',
      wordCount: 4,
    })
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [node] }))
    listDocumentsMock.mockResolvedValue(ok([document]))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      instruction: '接下来完成第2集的正文编写',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('clarify')
    if (result.data.kind === 'clarify') {
      expect(result.data.document).not.toBeNull()
      if (!result.data.document) return
      expect(result.data.document.id).toBe('doc-2')
      expect(result.data.message).toContain('避免误覆盖已有内容')
    }
  })

  it('未创建文档但存在大纲时要求创建文档并写入正文', async () => {
    const node = makeNode()
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [node] }))
    listDocumentsMock.mockResolvedValue(ok([]))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      instruction: '接下来完成第二集的正文编写',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('proceed')
    if (result.data.kind === 'proceed') {
      expect(result.data.mode).toBe('create_document')
      expect(result.data.instructionAddon).toContain('必须调用 create_document')
      expect(result.data.instructionAddon).toContain(`outlineNodeId="${node.id}"`)
    }
  })

  it('已有空文档时要求追加正文到该文档', async () => {
    const node = makeNode()
    const document = makeDocument({ outlineNodeId: node.id })
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [node] }))
    listDocumentsMock.mockResolvedValue(ok([document]))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      instruction: '接下来完成第2集的正文编写',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('proceed')
    if (result.data.kind === 'proceed') {
      expect(result.data.mode).toBe('append_empty_document')
      expect(result.data.instructionAddon).toContain('必须调用 append_document_content')
      expect(result.data.instructionAddon).toContain(`documentId="${document.id}"`)
    }
  })

  it('用户在澄清后回复按第一种时继承目标文档并续写', async () => {
    const node = makeNode()
    const document = makeDocument({
      outlineNodeId: node.id,
      plainText: '已有正文',
      wordCount: 4,
    })
    getThreadStateMock.mockResolvedValue(ok({
      id: 'state-1',
      projectId: 'proj-1',
      threadId: 'thread-1',
      currentGoal: '完成第2集正文编写',
      currentStep: '等待用户确认正文处理方式',
      userConstraints: [],
      acceptedDecisions: [],
      rejectedDirections: [],
      activeDocumentId: document.id,
      activeOutlineNodeId: node.id,
      lastContextPackId: 'cp-1',
      unresolvedQuestions: [
        'writing_intent_clarification:{"targetLabel":"第2集","documentId":"doc-2","outlineNodeId":"node-2"}',
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }))
    getDocumentMock.mockResolvedValue(ok(document))
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [node] }))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      threadId: 'thread-1',
      instruction: '按第一种',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('proceed')
    if (result.data.kind === 'proceed') {
      expect(result.data.mode).toBe('append_existing_document')
      expect(result.data.document?.id).toBe('doc-2')
      expect(result.data.instructionAddon).toContain('继续在现有正文后续写')
      expect(result.data.instructionAddon).toContain(`documentId="${document.id}"`)
    }
  })

  it('用户在澄清后回复按第二种时继承目标文档并重写全文', async () => {
    const node = makeNode()
    const document = makeDocument({
      outlineNodeId: node.id,
      plainText: '已有正文',
      wordCount: 4,
    })
    getThreadStateMock.mockResolvedValue(ok({
      id: 'state-1',
      projectId: 'proj-1',
      threadId: 'thread-1',
      currentGoal: '完成第2集正文编写',
      currentStep: '等待用户确认正文处理方式',
      userConstraints: [],
      acceptedDecisions: [],
      rejectedDirections: [],
      activeDocumentId: document.id,
      activeOutlineNodeId: node.id,
      lastContextPackId: 'cp-1',
      unresolvedQuestions: [
        'writing_intent_clarification:{"targetLabel":"第2集","documentId":"doc-2","outlineNodeId":"node-2"}',
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }))
    getDocumentMock.mockResolvedValue(ok(document))
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [node] }))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      threadId: 'thread-1',
      instruction: '按第二种',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('proceed')
    if (result.data.kind === 'proceed') {
      expect(result.data.mode).toBe('replace_existing_document')
      expect(result.data.document?.id).toBe('doc-2')
      expect(result.data.instructionAddon).toContain('重写并替换')
      expect(result.data.instructionAddon).toContain('mode="replace_all"')
    }
  })

  it('找不到对应大纲节点时返回澄清问题', async () => {
    getOutlineMock.mockResolvedValue(ok({ outline: {}, nodes: [makeNode({ title: '第1集' })] }))
    listDocumentsMock.mockResolvedValue(ok([]))

    const result = await analyzeEpisodeWritingIntent({
      projectId: 'proj-1',
      instruction: '接下来完成第2集的正文编写',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('clarify')
    if (result.data.kind === 'clarify') {
      expect(result.data.document).toBeNull()
      expect(result.data.message).toContain('没有在当前大纲中找到第2集')
    }
  })
})
