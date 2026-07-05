// useMessageActions 回归测试：验证 Agent 采纳效果（待优化项 #7）
// 对应待优化项 #7：Agent 面板"已采纳"未产生实质效果
//
// 覆盖场景：
// 1. 文档类任务（rewrite）+ 有活动文档 → 生成 append_document_content 待确认操作
// 2. 文档类任务（rewrite）+ 无活动文档 → 提示"请先打开一个文档"，不标记为已采纳
// 3. generate_card 任务 → 生成 create_card 待确认操作
// 4. generate_outline 任务 → 生成 create_outline_nodes_from_markdown 待确认操作

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import type { AgentMessage, ContextPack } from '@/types'

// ============ mock Service 层 ============
const updateMessageAdoptionMock = vi.fn()
const getContextPackMock = vi.fn()
const createCardMock = vi.fn()
const createKnowledgeMock = vi.fn()
const createOutlineNodesFromMarkdownMock = vi.fn()
const recordAcceptedDecisionMock = vi.fn()
const recordRejectedDirectionMock = vi.fn()
const createPendingActionFromAdoptionMock = vi.fn()

vi.mock('@/services/agent/AgentService', () => ({
  updateMessageAdoptionService: (...args: unknown[]) => updateMessageAdoptionMock(...args),
}))

vi.mock('@/services/context/ContextService', () => ({
  getContextPack: (...args: unknown[]) => getContextPackMock(...args),
}))

vi.mock('@/services/card/CardService', () => ({
  createCard: (...args: unknown[]) => createCardMock(...args),
}))

vi.mock('@/services/knowledge/KnowledgeService', () => ({
  createKnowledge: (...args: unknown[]) => createKnowledgeMock(...args),
}))

vi.mock('@/services/outline/OutlineService', () => ({
  createOutlineNodesFromMarkdown: (...args: unknown[]) => createOutlineNodesFromMarkdownMock(...args),
}))

vi.mock('@/services/agent/AgentThreadStateService', () => ({
  recordAcceptedDecision: (...args: unknown[]) => recordAcceptedDecisionMock(...args),
  recordRejectedDirection: (...args: unknown[]) => recordRejectedDirectionMock(...args),
}))

vi.mock('@/services/agent/PendingActionService', () => ({
  createPendingActionFromAdoption: (...args: unknown[]) =>
    createPendingActionFromAdoptionMock(...args),
}))

const { useMessageActions } = await import('./useMessageActions')

// ============ 测试夹具 ============

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    threadId: 't1',
    projectId: 'p1',
    role: 'assistant',
    content: '这是 AI 回复内容',
    structuredOutput: null,
    explanation: null,
    contextPackId: 'cp-1',
    agentRunId: 'run-1',
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeContextPack(
  taskType: string,
  overrides: Partial<ContextPack> = {},
): ContextPack {
  return {
    id: 'cp-1',
    projectId: 'p1',
    threadId: 't1',
    taskType: taskType as ContextPack['taskType'],
    userInstruction: null,
    contextScope: 'current_object',
    selectedText: null,
    documentIds: [],
    sourceIds: [],
    sourceChunkIds: [],
    cardIds: [],
    knowledgeIds: [],
    outlineNodeIds: [],
    previousMessageIds: [],
    projectRulesSnapshot: null,
    contextSummary: '',
    tokenEstimate: 100,
    entries: [],
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.getState().setActiveDocumentId(null)
  useAppStore.getState().setAgentInlineCandidate(null)
  useAppStore.getState().setSelectedText('')

  // 默认 mock 返回成功
  updateMessageAdoptionMock.mockResolvedValue({ ok: true, data: undefined })
  recordAcceptedDecisionMock.mockResolvedValue({ ok: true, data: undefined })
  recordRejectedDirectionMock.mockResolvedValue({ ok: true, data: undefined })
  createPendingActionFromAdoptionMock.mockResolvedValue({
    ok: true,
    data: {
      id: 'action-1',
      messageId: 'msg-1',
      projectId: 'p1',
      threadId: 't1',
      toolName: 'append_document_content',
      args: {},
      summary: '追加正文内容',
      status: 'pending',
      createdAt: '2025-01-01T00:00:00Z',
      appliedAt: null,
    },
  })
  getContextPackMock.mockImplementation(async () => ({
    ok: true,
    data: makeContextPack('rewrite'),
  }))
})

// ============ 测试用例 ============

describe('useMessageActions Agent 采纳效果（待优化项 #7）', () => {
  describe('文档类任务（rewrite/expand/summarize/answer_question/format_text）', () => {
    it('有活动文档时，adopt 生成正文待确认操作并标记为已采纳', async () => {
      useAppStore.getState().setActiveDocumentId('doc-1')
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('rewrite') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage())
      })

      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ id: 'msg-1' }),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '',
      })
      // 验证：消息状态更新为 applied
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      // 验证：提示消息
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })

    it('正文待确认操作生成后，在编辑器中显示内联候选', async () => {
      useAppStore.getState().setActiveDocumentId('doc-1')
      useAppStore.getState().setSelectedText('需要替换的原文')
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('rewrite') })
      createPendingActionFromAdoptionMock.mockResolvedValueOnce({
        ok: true,
        data: {
          id: 'action-inline-1',
          messageId: 'msg-1',
          projectId: 'p1',
          threadId: 't1',
          toolName: 'append_document_content',
          args: {
            documentId: 'doc-1',
            content: '新的正文内容',
            mode: 'replace_selection',
            selectedText: '需要替换的原文',
          },
          summary: '替换当前选区（7 字 → 6 字）',
          status: 'pending',
          createdAt: '2025-01-01T00:00:00Z',
          appliedAt: null,
        },
      })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '新的正文内容' }))
      })

      expect(useAppStore.getState().agentInlineCandidate).toEqual({
        actionId: 'action-inline-1',
        messageId: 'msg-1',
        documentId: 'doc-1',
        content: '新的正文内容',
        summary: '替换当前选区（7 字 → 6 字）',
        mode: 'replace_selection',
        selectedText: '需要替换的原文',
      })
    })

    it('无活动文档时，adopt 提示用户先打开文档', async () => {
      // activeDocumentId 为 null（默认）
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('rewrite') })
      createPendingActionFromAdoptionMock.mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请先打开一个文档，再采纳此内容',
          retryable: false,
        },
      })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage())
      })

      // 验证：未标记为已采纳
      expect(updateMessageAdoptionMock).not.toHaveBeenCalled()
      // 验证：提示消息
      expect(result.current.alertMessage).toBe('请先打开一个文档，再采纳此内容')
    })

    it('format_text 任务有活动文档时也生成正文待确认操作', async () => {
      useAppStore.getState().setActiveDocumentId('doc-2')
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('format_text') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '格式化后的文本' }))
      })

      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: '格式化后的文本' }),
        destination: 'document',
        activeDocumentId: 'doc-2',
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
    })

    it('有选区时，adopt 将选区快照传给待确认操作', async () => {
      useAppStore.getState().setActiveDocumentId('doc-1')
      useAppStore.getState().setSelectedText('需要替换的原文')
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('rewrite') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '新的正文内容' }))
      })

      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: '新的正文内容' }),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '需要替换的原文',
      })
    })
  })

  describe('generate_card 任务', () => {
    it('adopt 生成创建卡片待确认操作并标记为已采纳', async () => {
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('generate_card') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage())
      })

      expect(createCardMock).not.toHaveBeenCalled()
      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ id: 'msg-1' }),
        destination: 'card',
        activeDocumentId: null,
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })
  })

  describe('generate_outline 任务', () => {
    it('adopt 生成创建大纲待确认操作并标记为已采纳', async () => {
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('generate_outline') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage())
      })

      expect(createOutlineNodesFromMarkdownMock).not.toHaveBeenCalled()
      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ id: 'msg-1' }),
        destination: 'outline',
        activeDocumentId: null,
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })
  })

  describe('answer_question 任务按内容结构推断采纳目标', () => {
    it('含 Markdown 标题时推断为 outline', async () => {
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('answer_question') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '# 第一章\n## 第一节' }))
      })

      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: '# 第一章\n## 第一节' }),
        destination: 'outline',
        activeDocumentId: null,
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })

    it('用户明确要求正文编写时，即使回复含大纲结构也采纳到当前文档', async () => {
      useAppStore.getState().setActiveDocumentId('doc-1')
      getContextPackMock.mockResolvedValue({
        ok: true,
        data: makeContextPack('answer_question', {
          userInstruction: '请完成第一卷第1集的正文编写',
        }),
      })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      const outlineLikeContent = '# 第一卷 第1集\n1. 开场\n2. 冲突\n\n正文片段：小樱桃抬起头。'
      await act(async () => {
        await result.current.adopt(makeMessage({ content: outlineLikeContent }))
      })

      expect(createOutlineNodesFromMarkdownMock).not.toHaveBeenCalled()
      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: outlineLikeContent }),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })

    it('短且概念化时推断为 card', async () => {
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('answer_question') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '主角名字：张三' }))
      })

      expect(createCardMock).not.toHaveBeenCalled()
      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: '主角名字：张三' }),
        destination: 'card',
        activeDocumentId: null,
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })

    it('含规则/事实性描述时推断为 knowledge', async () => {
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('answer_question') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(
          makeMessage({ content: '世界观规则：魔法需要消耗精神力，禁止无咒施法。' }),
        )
      })

      expect(createKnowledgeMock).not.toHaveBeenCalled()
      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({
          content: '世界观规则：魔法需要消耗精神力，禁止无咒施法。',
        }),
        destination: 'knowledge',
        activeDocumentId: null,
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
      expect(result.current.alertMessage).toBe('已生成待确认操作，请在消息下方执行')
    })

    it('普通叙述文本且有活动文档时推断为 document', async () => {
      useAppStore.getState().setActiveDocumentId('doc-1')
      getContextPackMock.mockResolvedValue({ ok: true, data: makeContextPack('answer_question') })

      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.adopt(makeMessage({ content: '这是一段普通的续写内容。' }))
      })

      expect(createPendingActionFromAdoptionMock).toHaveBeenCalledWith({
        message: expect.objectContaining({ content: '这是一段普通的续写内容。' }),
        destination: 'document',
        activeDocumentId: 'doc-1',
        selectedText: '',
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'applied',
      })
    })
  })

  describe('另存为卡片/知识', () => {
    it('saveAsCard 调用服务链路并提示保存结果', async () => {
      createCardMock.mockResolvedValue({
        ok: true,
        data: {
          id: 'card-1',
          projectId: 'p1',
          title: '保存后的卡片',
          type: 'ai_generated',
          content: '这是 AI 回复内容',
          summary: '这是 AI 回复内容',
          status: 'pending',
          tags: null,
          sourceId: null,
          sourceChunkId: null,
          sourceDocumentId: null,
          sourceAgentMessageId: null,
          aiUsageAllowed: true,
          isDeleted: false,
          deletedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })
      const onMessagesChanged = vi.fn()
      const { result } = renderHook(() => useMessageActions({ onMessagesChanged }))

      await act(async () => {
        await result.current.saveAsCard(makeMessage({ content: '# 保存后的卡片\n正文' }))
      })

      expect(createCardMock).toHaveBeenCalledWith({
        projectId: 'p1',
        title: '保存后的卡片',
        type: 'ai_generated',
        content: '# 保存后的卡片\n正文',
        summary: '# 保存后的卡片\n正文',
        aiUsageAllowed: true,
      })
      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'saved_as_card',
        savedAsCardId: 'card-1',
      })
      expect(onMessagesChanged).toHaveBeenCalledTimes(1)
      expect(result.current.alertMessage).toBe('已保存为卡片「保存后的卡片」')
    })

    it('saveAsKnowledge 失败时展示服务错误且不刷新消息', async () => {
      createKnowledgeMock.mockResolvedValue({
        ok: false,
        error: { code: 'KNOWLEDGE_ERROR', message: '写入失败', retryable: true },
      })
      const onMessagesChanged = vi.fn()
      const { result } = renderHook(() => useMessageActions({ onMessagesChanged }))

      await act(async () => {
        await result.current.saveAsKnowledge(makeMessage())
      })

      expect(updateMessageAdoptionMock).not.toHaveBeenCalled()
      expect(onMessagesChanged).not.toHaveBeenCalled()
      expect(result.current.alertMessage).toBe('知识创建失败：写入失败')
    })
  })

  describe('reject 拒绝', () => {
    it('reject 调用 updateMessageAdoptionService 标记为 rejected', async () => {
      const { result } = renderHook(() => useMessageActions({ onMessagesChanged: vi.fn() }))

      await act(async () => {
        await result.current.reject(makeMessage())
      })

      expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
        messageId: 'msg-1',
        adoptionStatus: 'rejected',
      })
    })
  })
})
