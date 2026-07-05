// PendingActionService 单元测试
// 覆盖 apply / reject / applyAll 的核心路径与状态流转

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ServiceResult } from '@/types/service'
import type { PendingToolAction } from '@/types'

// ============ mock Repository ============
const findPendingActionByIdMock = vi.fn<(id: string) => Promise<PendingToolAction | null>>()
const listPendingActionsByMessageMock = vi.fn<(id: string) => Promise<PendingToolAction[]>>()
const insertPendingActionMock = vi.fn()
const updatePendingActionStatusMock = vi.fn<(id: string, status: 'pending' | 'applied' | 'rejected') => Promise<void>>()

vi.mock('@/services/database/agentPendingActionRepository', () => ({
  findPendingActionById: (id: string) => findPendingActionByIdMock(id),
  insertPendingAction: (...args: unknown[]) => insertPendingActionMock(...args),
  listPendingActionsByMessage: (id: string) => listPendingActionsByMessageMock(id),
  updatePendingActionStatus: (id: string, status: 'pending' | 'applied' | 'rejected') =>
    updatePendingActionStatusMock(id, status),
}))

// ============ mock 业务 Service ============
const createOutlineNodeMock = vi.fn()
const createOutlineNodesFromMarkdownMock = vi.fn()
const updateOutlineNodeServiceMock = vi.fn()
const deleteOutlineNodeMock = vi.fn()
const createDocumentMock = vi.fn()
const getDocumentMock = vi.fn()
const autosaveDocumentMock = vi.fn()
const setDocumentInitialContentMock = vi.fn()
const createCardMock = vi.fn()
const updateCardMock = vi.fn()
const updateCardStatusServiceMock = vi.fn()
const createKnowledgeMock = vi.fn()
const updateKnowledgeMock = vi.fn()

vi.mock('@/services/outline/OutlineService', () => ({
  createOutlineNode: (...args: unknown[]) => createOutlineNodeMock(...(args as [])),
  createOutlineNodesFromMarkdown: (...args: unknown[]) => createOutlineNodesFromMarkdownMock(...(args as [])),
  updateOutlineNodeService: (...args: unknown[]) => updateOutlineNodeServiceMock(...(args as [])),
  deleteOutlineNode: (...args: unknown[]) => deleteOutlineNodeMock(...(args as [])),
}))

vi.mock('@/services/document/DocumentService', () => ({
  createDocument: (...args: unknown[]) => createDocumentMock(...(args as [])),
  getDocument: (...args: unknown[]) => getDocumentMock(...(args as [])),
  autosaveDocument: (...args: unknown[]) => autosaveDocumentMock(...(args as [])),
  setDocumentInitialContent: (...args: unknown[]) =>
    setDocumentInitialContentMock(...(args as [])),
}))

vi.mock('@/services/card/CardService', () => ({
  createCard: (...args: unknown[]) => createCardMock(...(args as [])),
  updateCard: (...args: unknown[]) => updateCardMock(...(args as [])),
  updateCardStatusService: (...args: unknown[]) => updateCardStatusServiceMock(...(args as [])),
}))

vi.mock('@/services/knowledge/KnowledgeService', () => ({
  createKnowledge: (...args: unknown[]) => createKnowledgeMock(...(args as [])),
  updateKnowledge: (...args: unknown[]) => updateKnowledgeMock(...(args as [])),
}))

const {
  applyPendingAction,
  rejectPendingAction,
  applyAllPendingActions,
  createPendingActionFromAdoption,
  listPendingActionsByMessageService,
} = await import('./PendingActionService')

// ============ 测试夹具 ============

function makeAction(overrides: Partial<PendingToolAction> = {}): PendingToolAction {
  return {
    id: 'pa-1',
    messageId: 'msg-1',
    projectId: 'proj-1',
    threadId: 'thread-1',
    toolName: 'create_outline_node',
    args: { projectId: 'proj-1', title: '第一章' },
    summary: '创建大纲节点「第一章」',
    status: 'pending',
    createdAt: '2025-01-01T00:00:00Z',
    appliedAt: null,
    ...overrides,
  }
}

function makeMessage() {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    projectId: 'proj-1',
    role: 'assistant' as const,
    content: '新的正文',
    structuredOutput: null,
    explanation: null,
    contextPackId: 'cp-1',
    agentRunId: 'run-1',
    adoptionStatus: 'not_applied' as const,
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2025-01-01T00:00:00Z',
  }
}

/// 解包成功结果
function unwrap<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(`Expected ok but got error: ${r.error.code}`)
  return r.data
}

/// 解包失败结果
function unwrapErr<T>(r: ServiceResult<T>) {
  if (r.ok) throw new Error(`Expected error but got ok: ${JSON.stringify(r.data)}`)
  return r.error
}

// ============ 测试 ============

describe('PendingActionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createPendingActionFromAdoption', () => {
    it('正文采纳无选区时生成 append 待确认操作', async () => {
      listPendingActionsByMessageMock.mockResolvedValue([])
      findPendingActionByIdMock.mockResolvedValueOnce(
        makeAction({
          toolName: 'append_document_content',
          args: { documentId: 'doc-1', content: '新的正文', mode: 'append' },
          summary: '追加正文内容（4 字）',
        }),
      )

      const result = await createPendingActionFromAdoption({
        message: makeMessage(),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '',
      })

      expect(unwrap(result).toolName).toBe('append_document_content')
      expect(insertPendingActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-1',
          toolName: 'append_document_content',
          args: expect.objectContaining({
            documentId: 'doc-1',
            content: '新的正文',
            mode: 'append',
          }),
          summary: '追加正文内容（4 字）',
          status: 'pending',
        }),
      )
    })

    it('正文采纳有选区时生成 replace_selection 待确认操作', async () => {
      listPendingActionsByMessageMock.mockResolvedValue([])
      findPendingActionByIdMock.mockResolvedValueOnce(
        makeAction({
          toolName: 'append_document_content',
          args: {
            documentId: 'doc-1',
            content: '新的正文',
            mode: 'replace_selection',
            selectedText: '旧正文',
          },
          summary: '替换当前选区（3 字 → 4 字）',
        }),
      )

      const result = await createPendingActionFromAdoption({
        message: makeMessage(),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '旧正文',
      })

      expect(unwrap(result).toolName).toBe('append_document_content')
      expect(insertPendingActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            documentId: 'doc-1',
            content: '新的正文',
            mode: 'replace_selection',
            selectedText: '旧正文',
          }),
          summary: '替换当前选区（3 字 → 4 字）',
        }),
      )
    })
  })

  describe('listPendingActionsByMessageService', () => {
    it('查询成功返回列表', async () => {
      const actions = [makeAction(), makeAction({ id: 'pa-2' })]
      listPendingActionsByMessageMock.mockResolvedValue(actions)

      const result = await listPendingActionsByMessageService('msg-1')
      expect(unwrap(result)).toEqual(actions)
    })
  })

  describe('applyPendingAction', () => {
    it('action 不存在返回 NOT_FOUND', async () => {
      findPendingActionByIdMock.mockResolvedValue(null)

      const result = await applyPendingAction('pa-x')
      const e = unwrapErr(result)
      expect(e.code).toBe('NOT_FOUND')
      expect(createOutlineNodeMock).not.toHaveBeenCalled()
    })

    it('action 状态非 pending 拒绝执行', async () => {
      findPendingActionByIdMock.mockResolvedValue(makeAction({ status: 'applied' }))

      const result = await applyPendingAction('pa-1')
      const e = unwrapErr(result)
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(createOutlineNodeMock).not.toHaveBeenCalled()
    })

    it('create_outline_node 路由正确，成功后状态变 applied', async () => {
      const action = makeAction({ toolName: 'create_outline_node' })
      findPendingActionByIdMock
        .mockResolvedValueOnce(action) // 首次查询
        .mockResolvedValueOnce({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' }) // apply 后查询
      createOutlineNodeMock.mockResolvedValue({ ok: true, data: { id: 'node-1' } })

      const result = await applyPendingAction('pa-1')
      expect(unwrap(result).status).toBe('applied')
      expect(createOutlineNodeMock).toHaveBeenCalledTimes(1)
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'applied')
    })

    it('业务 Service 失败时状态保持 pending', async () => {
      findPendingActionByIdMock.mockResolvedValue(makeAction())
      createOutlineNodeMock.mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '标题不能为空', retryable: false },
      })

      const result = await applyPendingAction('pa-1')
      const e = unwrapErr(result)
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(updatePendingActionStatusMock).not.toHaveBeenCalled()
    })

    it('未知 toolName 返回 VALIDATION_ERROR', async () => {
      findPendingActionByIdMock.mockResolvedValue(
        makeAction({ toolName: 'unknown_tool' as PendingToolAction['toolName'] }),
      )

      const result = await applyPendingAction('pa-1')
      const e = unwrapErr(result)
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(e.message).toContain('unknown_tool')
    })

    it('delete_outline_node 路由正确', async () => {
      findPendingActionByIdMock
        .mockResolvedValueOnce(makeAction({ toolName: 'delete_outline_node', args: { nodeId: 'n1' } }))
        .mockResolvedValueOnce(makeAction({ toolName: 'delete_outline_node', args: { nodeId: 'n1' }, status: 'applied' }))
      deleteOutlineNodeMock.mockResolvedValue({ ok: true, data: undefined })

      const result = await applyPendingAction('pa-1')
      expect(unwrap(result).status).toBe('applied')
      expect(deleteOutlineNodeMock).toHaveBeenCalledWith('n1')
    })

    it('create_outline_nodes_from_markdown 路由正确', async () => {
      const action = makeAction({
        toolName: 'create_outline_nodes_from_markdown',
        args: { projectId: 'proj-1', markdown: '# 第一章\n## 第一节' },
      })
      findPendingActionByIdMock
        .mockResolvedValueOnce(action)
        .mockResolvedValueOnce({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' })
      createOutlineNodesFromMarkdownMock.mockResolvedValue({
        ok: true,
        data: [{ id: 'n1', title: '第一章' }, { id: 'n2', title: '第一节' }],
      })

      const result = await applyPendingAction('pa-1')
      expect(unwrap(result).status).toBe('applied')
      expect(createOutlineNodesFromMarkdownMock).toHaveBeenCalledWith('proj-1', '# 第一章\n## 第一节')
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'applied')
    })

    it('append_document_content 的 replace_selection 模式替换原选区文本', async () => {
      const action = makeAction({
        toolName: 'append_document_content',
        args: {
          documentId: 'doc-1',
          content: '新的正文',
          mode: 'replace_selection',
          selectedText: '旧正文',
        },
      })
      findPendingActionByIdMock
        .mockResolvedValueOnce(action)
        .mockResolvedValueOnce({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' })
      getDocumentMock.mockResolvedValue({
        ok: true,
        data: {
          projectId: 'proj-1',
          plainText: '开头\n旧正文\n结尾',
        },
      })
      autosaveDocumentMock.mockResolvedValue({ ok: true, data: undefined })

      const result = await applyPendingAction('pa-1')

      expect(unwrap(result).status).toBe('applied')
      expect(autosaveDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          plainText: '开头\n新的正文\n结尾',
          contentJson: expect.objectContaining({ type: 'doc' }),
          wordCount: '开头\n新的正文\n结尾'.length,
        }),
      )
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'applied')
    })

    it('append_document_content 的 replace_selection 找不到原文时不落库', async () => {
      const action = makeAction({
        toolName: 'append_document_content',
        args: {
          documentId: 'doc-1',
          content: '新的正文',
          mode: 'replace_selection',
          selectedText: '不存在的原文',
        },
      })
      findPendingActionByIdMock.mockResolvedValueOnce(action)
      getDocumentMock.mockResolvedValue({
        ok: true,
        data: {
          projectId: 'proj-1',
          plainText: '开头\n旧正文\n结尾',
        },
      })

      const result = await applyPendingAction('pa-1')
      const e = unwrapErr(result)

      expect(e.code).toBe('VALIDATION_ERROR')
      expect(e.retryable).toBe(true)
      expect(autosaveDocumentMock).not.toHaveBeenCalled()
      expect(updatePendingActionStatusMock).not.toHaveBeenCalled()
    })

    it('append_document_content 的 replace_all 模式替换全文', async () => {
      const action = makeAction({
        toolName: 'append_document_content',
        args: {
          documentId: 'doc-1',
          content: '完整新正文',
          mode: 'replace_all',
        },
      })
      findPendingActionByIdMock
        .mockResolvedValueOnce(action)
        .mockResolvedValueOnce({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' })
      getDocumentMock.mockResolvedValue({
        ok: true,
        data: {
          id: 'doc-1',
          projectId: 'proj-1',
          contentJson: { type: 'doc', content: [] },
          plainText: '旧正文',
        },
      })
      autosaveDocumentMock.mockResolvedValue({ ok: true, data: undefined })

      const result = await applyPendingAction('pa-1')

      expect(unwrap(result).status).toBe('applied')
      expect(autosaveDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          plainText: '完整新正文',
          wordCount: '完整新正文'.length,
          contentJson: expect.objectContaining({ type: 'doc' }),
        }),
      )
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'applied')
    })
  })

    it('create_document 带 content 时创建文档并写入初始正文', async () => {
      const action = makeAction({
        toolName: 'create_document',
        args: {
          projectId: 'proj-1',
          title: '第2集 暑假第二天',
          outlineNodeId: 'node-2',
          content: '这是第2集正文。',
        },
      })
      findPendingActionByIdMock
        .mockResolvedValueOnce(action)
        .mockResolvedValueOnce({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' })
      createDocumentMock.mockResolvedValue({
        ok: true,
        data: { id: 'doc-2', projectId: 'proj-1', title: '第2集 暑假第二天' },
      })
      updateOutlineNodeServiceMock.mockResolvedValue({
        ok: true,
        data: { id: 'node-2', linkedDocumentId: 'doc-2', status: 'writing' },
      })
      setDocumentInitialContentMock.mockResolvedValue({ ok: true, data: undefined })

      const result = await applyPendingAction('pa-1')

      expect(unwrap(result).status).toBe('applied')
      expect(createDocumentMock).toHaveBeenCalledWith({
        projectId: 'proj-1',
        title: '第2集 暑假第二天',
        outlineNodeId: 'node-2',
      })
      expect(setDocumentInitialContentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-2',
          plainText: '这是第2集正文。',
          contentJson: expect.objectContaining({ type: 'doc' }),
          wordCount: '这是第2集正文。'.length,
        }),
      )
      expect(updateOutlineNodeServiceMock).toHaveBeenCalledWith({
        nodeId: 'node-2',
        patch: {
          linkedDocumentId: 'doc-2',
          status: 'writing',
        },
      })
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'applied')
    })

  describe('rejectPendingAction', () => {
    it('正常拒绝，状态变 rejected', async () => {
      findPendingActionByIdMock
        .mockResolvedValueOnce(makeAction({ status: 'pending' }))
        .mockResolvedValueOnce(makeAction({ status: 'rejected' }))

      const result = await rejectPendingAction('pa-1')
      expect(unwrap(result).status).toBe('rejected')
      expect(updatePendingActionStatusMock).toHaveBeenCalledWith('pa-1', 'rejected')
    })

    it('已处理的 action 不能重复拒绝', async () => {
      findPendingActionByIdMock.mockResolvedValue(makeAction({ status: 'applied' }))

      const result = await rejectPendingAction('pa-1')
      const e = unwrapErr(result)
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(updatePendingActionStatusMock).not.toHaveBeenCalled()
    })
  })

  describe('applyAllPendingActions', () => {
    it('批量执行，单条失败不阻塞后续', async () => {
      const actions = [
        makeAction({ id: 'pa-1', toolName: 'create_outline_node', args: { projectId: 'p1', title: '节点1' } }),
        makeAction({ id: 'pa-2', toolName: 'create_outline_node', args: { projectId: 'p1', title: '节点2' } }),
        makeAction({ id: 'pa-3', status: 'applied' }), // 非 pending，跳过
      ]
      listPendingActionsByMessageMock.mockResolvedValue(actions)

      // 第一条成功，第二条失败
      findPendingActionByIdMock
        .mockResolvedValueOnce(actions[0]!)
        .mockResolvedValueOnce({ ...actions[0]!, status: 'applied' })
        .mockResolvedValueOnce(actions[1]!)
      createOutlineNodeMock
        .mockResolvedValueOnce({ ok: true, data: { id: 'n1' } })
        .mockResolvedValueOnce({ ok: false, error: { code: 'X', message: '失败', retryable: false } })

      const result = await applyAllPendingActions('msg-1')
      const data = unwrap(result)
      expect(data.applied).toBe(1)
      expect(data.failed).toBe(1)
      expect(data.failedIds).toEqual(['pa-2'])
    })
  })
})
