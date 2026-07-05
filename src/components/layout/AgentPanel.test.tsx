// AgentPanel 回归测试：验证选中文本快捷动作（pendingAgentAction）被消费后自动发送
// 对应待优化项 #5：文档选中文本后改写/扩写等无法触发

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'

// mock Service 层，避免真实数据库与模型调用
const previewContextMock = vi.fn()
const createContextPackMock = vi.fn()
const listThreadsMock = vi.fn()
const createThreadMock = vi.fn()
const getOrCreateThreadByBoundObjectMock = vi.fn()
const listMessagesMock = vi.fn()
const sendMessageMock = vi.fn()
const getTaskContextLengthMock = vi.fn()
const getThreadStateMock = vi.fn()

vi.mock('@/services/context/ContextService', () => ({
  previewContext: (...args: unknown[]) => previewContextMock(...args),
  createContextPack: (...args: unknown[]) => createContextPackMock(...args),
  getContextPack: vi.fn(async () => null),
}))

vi.mock('@/services/agent/AgentService', () => ({
  listThreads: (...args: unknown[]) => listThreadsMock(...args),
  createThread: (...args: unknown[]) => createThreadMock(...args),
  getOrCreateThreadByBoundObject: (...args: unknown[]) =>
    getOrCreateThreadByBoundObjectMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  getTaskContextLength: (...args: unknown[]) => getTaskContextLengthMock(...args),
  updateMessageAdoptionService: vi.fn(async () => ({ ok: true, data: undefined })),
}))

vi.mock('@/services/agent/AgentThreadStateService', () => ({
  getThreadState: (...args: unknown[]) => getThreadStateMock(...args),
  recordAcceptedDecision: vi.fn(async () => ({ ok: true, data: undefined })),
  recordRejectedDirection: vi.fn(async () => ({ ok: true, data: undefined })),
}))

vi.mock('@/services/card/CardService', () => ({ createCard: vi.fn() }))
vi.mock('@/services/knowledge/KnowledgeService', () => ({ createKnowledge: vi.fn() }))
vi.mock('@/services/outline/OutlineService', () => ({ createOutlineNodesFromMarkdown: vi.fn() }))

// 延迟导入，确保 mock 已注册
const { AgentPanel } = await import('./AgentPanel')

function renderAgentPanel(projectId: string) {
  return render(
    <MemoryRouter
      initialEntries={[`/projects/${projectId}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/projects/:projectId" element={<AgentPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  act(() => {
    useAppStore.getState().setAgentPanelOpen(true)
    useAppStore.getState().setSelectedText('')
    useAppStore.getState().setPendingAgentAction(null)
  })

  // 默认返回一个已有线程，projectId 动态匹配传入参数，避免触发自动创建
  listThreadsMock.mockImplementation(async (pid: string) => ({
    ok: true,
    data: [{ id: 't1', projectId: pid, title: '已有对话', boundObjectType: 'project', boundObjectId: pid, contextScope: 'whole_project' }],
  }))
  listMessagesMock.mockResolvedValue({ ok: true, data: [] })
  getThreadStateMock.mockResolvedValue({ ok: true, data: null })
  getTaskContextLengthMock.mockResolvedValue(4000)
  getOrCreateThreadByBoundObjectMock.mockImplementation(async (input: {
    projectId: string
    boundObjectType: string
    boundObjectId: string
    contextScope?: string
  }) => ({
    ok: true,
    data: {
      id: 'object-thread-1',
      projectId: input.projectId,
      title: '对象对话',
      boundObjectType: input.boundObjectType,
      boundObjectId: input.boundObjectId,
      contextScope: input.contextScope ?? 'current_object',
    },
  }))
  previewContextMock.mockImplementation(async (input: { projectId: string; threadId: string; taskType: string }) => ({
    ok: true,
    data: {
      id: 'preview-1',
      projectId: input.projectId,
      threadId: input.threadId,
      taskType: input.taskType,
      entries: [],
      tokenEstimate: 100,
      tokenBudget: 4000,
      warnings: [],
    },
  }))
})

describe('AgentPanel 选中文本快捷动作消费（待优化项 #5）', () => {
  it('pendingAgentAction 被消费后自动触发上下文预览', async () => {
    const projectId = 'p-test'
    const selectedText = '这是要改写的选中文本'

    // 先渲染，加载已有线程
    renderAgentPanel(projectId)

    await waitFor(() => {
      expect(listThreadsMock).toHaveBeenCalledWith(projectId)
    })

    // 设置选中文本与待处理动作（模拟 SelectionFloatingMenu 触发）
    act(() => {
      useAppStore.getState().setSelectedText(selectedText)
      useAppStore.getState().setPendingAgentAction({
        taskType: 'rewrite',
        template: '请改写当前选区，保留原意并根据项目风格规则调整表达。',
      })
    })

    // 验证：自动触发 previewContext，且传入指令与选中文本
    await waitFor(() => {
      expect(previewContextMock).toHaveBeenCalledTimes(1)
    })

    const callArgs = previewContextMock.mock.calls[0][0]
    expect(callArgs.userInstruction).toContain('请改写当前选区')
    expect(callArgs.taskType).toBe('rewrite')
    expect(callArgs.selectedText).toBe(selectedText)
  })

  it('消费后 pendingAgentAction 被清空，避免重复触发', async () => {
    const projectId = 'p-test2'
    renderAgentPanel(projectId)

    await waitFor(() => {
      expect(listThreadsMock).toHaveBeenCalledWith(projectId)
    })

    act(() => {
      useAppStore.getState().setPendingAgentAction({
        taskType: 'expand',
        template: '请基于参考内容扩展当前文本。',
      })
    })

    await waitFor(() => {
      expect(previewContextMock).toHaveBeenCalled()
    })

    // pendingAgentAction 应被清空
    expect(useAppStore.getState().pendingAgentAction).toBeNull()
  })

  it('对象级 pendingAgentAction 使用绑定对象线程触发上下文预览', async () => {
    const projectId = 'p-object'
    renderAgentPanel(projectId)

    await waitFor(() => {
      expect(listThreadsMock).toHaveBeenCalledWith(projectId)
    })

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
      expect(getOrCreateThreadByBoundObjectMock).toHaveBeenCalledWith({
        projectId,
        agentRole: 'writing_assistant',
        boundObjectType: 'card',
        boundObjectId: 'card-1',
        title: '扩展卡片：角色卡',
        contextScope: 'current_object',
      })
    })

    const callArgs = previewContextMock.mock.calls[0][0]
    expect(callArgs.threadId).toBe('object-thread-1')
    expect(callArgs.boundObjectType).toBe('card')
    expect(callArgs.boundObjectId).toBe('card-1')
    expect(callArgs.contextScope).toBe('current_object')
  })
})

describe('AgentPanel 多轮状态展示（AGENT-MULTI-002）', () => {
  it('展示当前协作目标，并可生成继续上一轮指令', async () => {
    getThreadStateMock.mockResolvedValue({
      ok: true,
      data: {
        id: 'state-1',
        projectId: 'p-state',
        threadId: 't1',
        currentGoal: '完成第一卷第1集正文编写',
        currentStep: '已采纳，等待下一步',
        userConstraints: [],
        acceptedDecisions: [
          '已采纳到正文 | 追加正文内容（3119 字）：## 第3集 院子里的向日葵 小樱桃家的院子里，种着一排向日葵。'.repeat(3),
        ],
        rejectedDirections: ['已拒绝：大纲版本'],
        activeDocumentId: 'doc-1',
        activeOutlineNodeId: null,
        lastContextPackId: 'cp-1',
        unresolvedQuestions: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    renderAgentPanel('p-state')

    await waitFor(() => {
      expect(screen.getByText('完成第一卷第1集正文编写')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /继续/ }))

    const input = screen.getByPlaceholderText('输入消息或使用快捷动作...') as HTMLTextAreaElement
    expect(input.value).toContain('请继续推进当前协作目标。')
    expect(input.value).toContain('任务目标：完成第一卷第1集正文编写')
    expect(input.value).toContain('参考约束：沿用最近已采纳的方向（1 条）。')
    expect(input.value).toContain('规避方向：不要重复已拒绝的方向（1 条）。')
    expect(input.value).toContain('执行要求：请先识别真实意图并检查目标文档状态')
    expect(input.value).not.toContain('追加正文内容')
    expect(input.value).not.toContain('## 第3集')
  })
})
