import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, Card, Knowledge } from '@/types'

const createCardMock = vi.fn()
const createKnowledgeMock = vi.fn()
const updateMessageAdoptionMock = vi.fn()

vi.mock('@/services/card/CardService', () => ({
  createCard: (...args: unknown[]) => createCardMock(...args),
}))

vi.mock('@/services/knowledge/KnowledgeService', () => ({
  createKnowledge: (...args: unknown[]) => createKnowledgeMock(...args),
}))

vi.mock('@/services/agent/AgentService', () => ({
  updateMessageAdoptionService: (...args: unknown[]) => updateMessageAdoptionMock(...args),
}))

const {
  extractAgentMessageTitle,
  saveAgentMessageAsCard,
  saveAgentMessageAsKnowledge,
} = await import('./AgentMessageSaveService')

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    role: 'assistant',
    content: '# 建议标题\n正文内容',
    structuredOutput: null,
    explanation: null,
    contextPackId: null,
    agentRunId: null,
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    projectId: 'project-1',
    title: '建议标题',
    type: 'ai_generated',
    content: '# 建议标题\n正文内容',
    summary: '# 建议标题\n正文内容',
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
    ...overrides,
  }
}

function makeKnowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  return {
    id: 'knowledge-1',
    projectId: 'project-1',
    title: '建议标题',
    type: 'ai_generated',
    content: '# 建议标题\n正文内容',
    summary: '# 建议标题\n正文内容',
    status: 'pending',
    sourceType: 'agent',
    sourceId: null,
    aiUsageAllowed: true,
    confidence: 0.7,
    version: 1,
    replacedById: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AgentMessageSaveService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMessageAdoptionMock.mockResolvedValue({ ok: true, data: undefined })
  })

  it('从助手消息保存为卡片并回填消息状态', async () => {
    const card = makeCard()
    createCardMock.mockResolvedValue({ ok: true, data: card })

    const result = await saveAgentMessageAsCard(makeMessage())

    expect(createCardMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: '建议标题',
      type: 'ai_generated',
      content: '# 建议标题\n正文内容',
      summary: '# 建议标题\n正文内容',
      aiUsageAllowed: true,
    })
    expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
      messageId: 'msg-1',
      adoptionStatus: 'saved_as_card',
      savedAsCardId: 'card-1',
    })
    expect(result).toEqual({ ok: true, data: { objectType: 'card', card } })
  })

  it('从助手消息保存为知识并回填消息状态', async () => {
    const knowledge = makeKnowledge()
    createKnowledgeMock.mockResolvedValue({ ok: true, data: knowledge })

    const result = await saveAgentMessageAsKnowledge(makeMessage())

    expect(createKnowledgeMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: '建议标题',
      type: 'ai_generated',
      content: '# 建议标题\n正文内容',
      summary: '# 建议标题\n正文内容',
      sourceType: 'agent',
      aiUsageAllowed: true,
      confidence: 0.7,
    })
    expect(updateMessageAdoptionMock).toHaveBeenCalledWith({
      messageId: 'msg-1',
      adoptionStatus: 'saved_as_knowledge',
      savedAsKnowledgeId: 'knowledge-1',
    })
    expect(result).toEqual({ ok: true, data: { objectType: 'knowledge', knowledge } })
  })

  it('创建对象失败时不回填消息状态', async () => {
    createCardMock.mockResolvedValue({
      ok: false,
      error: { code: 'CARD_ERROR', message: '写入失败', retryable: true },
    })

    const result = await saveAgentMessageAsCard(makeMessage())

    expect(updateMessageAdoptionMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: { code: 'CARD_ERROR', message: '卡片创建失败：写入失败', retryable: true },
    })
  })

  it('消息状态回填失败时返回统一错误', async () => {
    createKnowledgeMock.mockResolvedValue({ ok: true, data: makeKnowledge() })
    updateMessageAdoptionMock.mockResolvedValue({
      ok: false,
      error: { code: 'AGENT_ERROR', message: '消息不存在', retryable: false },
    })

    const result = await saveAgentMessageAsKnowledge(makeMessage())

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'AGENT_ERROR',
        message: '消息状态更新失败：消息不存在',
        retryable: false,
      },
    })
  })

  it('提取标题时清理 Markdown 标记并提供兜底标题', () => {
    expect(extractAgentMessageTitle('  \n## **设定标题**\n正文')).toBe('设定标题')
    expect(extractAgentMessageTitle('')).toBe('AI 生成内容')
  })
})
