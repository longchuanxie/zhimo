// AgentCommandService 回归测试
// 验证编辑器选区动作不再由组件直接编排业务逻辑。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, Knowledge } from '@/types'

const createCardMock = vi.fn()
const createKnowledgeMock = vi.fn()

vi.mock('@/services/card/CardService', () => ({
  createCard: (...args: unknown[]) => createCardMock(...args),
}))

vi.mock('@/services/knowledge/KnowledgeService', () => ({
  createKnowledge: (...args: unknown[]) => createKnowledgeMock(...args),
}))

const {
  createObjectAgentAction,
  executeSelectionAgentCommand,
} = await import('./AgentCommandService')

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    projectId: 'project-1',
    title: '选区标题',
    type: 'manual',
    content: '选区内容',
    summary: '选区内容',
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
    title: '选区知识',
    type: 'manual',
    content: '选区内容',
    summary: '选区内容',
    status: 'pending',
    sourceType: 'manual',
    sourceId: null,
    aiUsageAllowed: true,
    confidence: 1,
    version: 1,
    replacedById: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('executeSelectionAgentCommand', () => {
  beforeEach(() => {
    createCardMock.mockReset()
    createKnowledgeMock.mockReset()
  })

  it('将改写选区转换为待派发 Agent 动作', async () => {
    const result = await executeSelectionAgentCommand({
      projectId: 'project-1',
      command: 'rewrite',
      selectedText: '  需要改写的文本  ',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toEqual({
      kind: 'pending_agent_action',
      selectedText: '需要改写的文本',
      action: {
        taskType: 'rewrite',
        template: '请改写当前选区，保留原意并根据项目风格规则调整表达。',
      },
    })
    expect(createCardMock).not.toHaveBeenCalled()
    expect(createKnowledgeMock).not.toHaveBeenCalled()
  })

  it('从选区创建卡片', async () => {
    const card = makeCard({ title: '第一行标题' })
    createCardMock.mockResolvedValue({ ok: true, data: card })

    const result = await executeSelectionAgentCommand({
      projectId: 'project-1',
      command: 'save_as_card',
      selectedText: '第一行标题\n正文内容',
    })

    expect(createCardMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: '第一行标题',
      type: 'manual',
      content: '第一行标题\n正文内容',
      summary: '第一行标题\n正文内容',
      aiUsageAllowed: true,
    })
    expect(result).toEqual({ ok: true, data: { kind: 'created_card', card } })
  })

  it('从选区创建知识', async () => {
    const knowledge = makeKnowledge({ title: '关键设定' })
    createKnowledgeMock.mockResolvedValue({ ok: true, data: knowledge })

    const result = await executeSelectionAgentCommand({
      projectId: 'project-1',
      command: 'save_as_knowledge',
      selectedText: '关键设定\n后续说明',
    })

    expect(createKnowledgeMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: '关键设定',
      type: 'manual',
      content: '关键设定\n后续说明',
      summary: '关键设定\n后续说明',
      sourceType: 'manual',
      aiUsageAllowed: true,
      confidence: 1.0,
    })
    expect(result).toEqual({
      ok: true,
      data: { kind: 'created_knowledge', knowledge },
    })
  })

  it('空选区返回校验错误', async () => {
    const result = await executeSelectionAgentCommand({
      projectId: 'project-1',
      command: 'expand',
      selectedText: '   ',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.message).toBe('请先在文档中选择要处理的文本')
  })
})

describe('createObjectAgentAction', () => {
  it('为大纲节点生成对象绑定的起草命令', () => {
    const result = createObjectAgentAction({
      projectId: 'project-1',
      command: 'draft_outline_node',
      objectType: 'outline_node',
      objectId: 'outline-node-1',
      objectTitle: '第一章',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toEqual({
      taskType: 'answer_question',
      contextScope: 'current_object',
      boundObjectType: 'outline_node',
      boundObjectId: 'outline-node-1',
      threadTitle: '起草：第一章',
      autoSubmit: true,
      template: [
        '请围绕大纲节点「第一章」起草正文。',
        '要求：先判断该节点的写作目标、已有资料和关联上下文；如果需要写入正文，请生成待确认操作，不要直接覆盖文档。',
      ].join('\n'),
    })
  })

  it('为资料生成提炼卡片命令', () => {
    const result = createObjectAgentAction({
      projectId: 'project-1',
      command: 'extract_cards_from_source',
      objectType: 'source',
      objectId: 'source-1',
      objectTitle: '访谈资料',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.taskType).toBe('generate_card')
    expect(result.data.boundObjectType).toBe('source')
    expect(result.data.boundObjectId).toBe('source-1')
    expect(result.data.contextScope).toBe('current_object')
    expect(result.data.autoSubmit).toBe(true)
    expect(result.data.template).toContain('请从资料「访谈资料」中提炼结构化卡片。')
  })

  it('为知识生成冲突检查命令', () => {
    const result = createObjectAgentAction({
      projectId: 'project-1',
      command: 'check_knowledge_conflict',
      objectType: 'knowledge',
      objectId: 'knowledge-1',
      objectTitle: '世界观规则',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.taskType).toBe('answer_question')
    expect(result.data.contextScope).toBe('related')
    expect(result.data.boundObjectType).toBe('knowledge')
    expect(result.data.template).toContain('请检查知识「世界观规则」是否与项目中已有知识、卡片或资料存在冲突。')
  })

  it('对象标题为空时返回校验错误', () => {
    const result = createObjectAgentAction({
      projectId: 'project-1',
      command: 'expand_card',
      objectType: 'card',
      objectId: 'card-1',
      objectTitle: '   ',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.message).toBe('对象标题不能为空')
  })
})
