// PendingActionList 组件测试
// 验证待确认操作列表的渲染与交互
//
// 覆盖场景：
// 1. 空列表返回 null（不渲染标题）
// 2. 渲染多条 pending 操作 + 全部执行按钮
// 3. 点击「执行」触发 applyAction
// 4. 点击「拒绝」触发 rejectAction
// 5. applied/rejected 状态不显示操作按钮
// 6. 全部执行按钮点击触发 applyAll

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PendingToolAction } from '@/types'
import type { ServiceResult } from '@/types/service'
import { APP_EVENTS } from '@/constants/events'

// ============ mock PendingActionService ============
const listPendingActionsByMessageServiceMock = vi.fn()
const applyPendingActionMock = vi.fn()
const rejectPendingActionMock = vi.fn()
const applyAllPendingActionsMock = vi.fn()

vi.mock('@/services/agent/PendingActionService', () => ({
  listPendingActionsByMessageService: (...args: unknown[]) =>
    listPendingActionsByMessageServiceMock(...args),
  applyPendingAction: (...args: unknown[]) => applyPendingActionMock(...args),
  rejectPendingAction: (...args: unknown[]) => rejectPendingActionMock(...args),
  applyAllPendingActions: (...args: unknown[]) => applyAllPendingActionsMock(...args),
}))

const { PendingActionList } = await import('./PendingActionList')

// ============ 测试夹具 ============

function makeAction(overrides: Partial<PendingToolAction> = {}): PendingToolAction {
  return {
    id: 'action-1',
    messageId: 'msg-1',
    projectId: 'p1',
    threadId: 't1',
    toolName: 'create_outline_node',
    args: { title: '第一章' },
    summary: '创建大纲节点「第一章」',
    status: 'pending',
    createdAt: '2025-01-01T00:00:00Z',
    appliedAt: null,
    ...overrides,
  }
}

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data } as ServiceResult<T>
}

beforeEach(() => {
  vi.clearAllMocks()
  // 默认空列表
  listPendingActionsByMessageServiceMock.mockResolvedValue(ok([]))
})

// ============ 测试用例 ============

describe('PendingActionList', () => {
  it('空列表时返回 null（不渲染标题）', async () => {
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([]))
    const { container } = render(<PendingActionList messageId="msg-1" />)
    await waitFor(() => {
      expect(listPendingActionsByMessageServiceMock).toHaveBeenCalled()
    })
    // 空列表不渲染任何内容
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('待确认操作')).not.toBeInTheDocument()
  })

  it('渲染多条 pending 操作并显示全部执行按钮', async () => {
    const actions = [
      makeAction({ id: 'a1', summary: '创建大纲节点「第一章」' }),
      makeAction({ id: 'a2', toolName: 'create_card', summary: '创建卡片「角色卡」' }),
    ]
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok(actions))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('待确认操作')).toBeInTheDocument()
    })

    expect(screen.getByText('创建大纲节点「第一章」')).toBeInTheDocument()
    expect(screen.getByText('创建卡片「角色卡」')).toBeInTheDocument()
    // 两条都是 pending，全部执行按钮显示数量 2
    expect(screen.getByText('全部执行（2）')).toBeInTheDocument()
    // 每条都有执行/拒绝按钮
    expect(screen.getAllByText('执行').length).toBe(2)
    expect(screen.getAllByText('拒绝').length).toBe(2)
  })

  it('点击「执行」触发 applyPendingAction', async () => {
    const action = makeAction({ id: 'a1' })
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([action]))
    applyPendingActionMock.mockResolvedValue(
      ok({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' }),
    )

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('执行')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('执行'))

    await waitFor(() => {
      expect(applyPendingActionMock).toHaveBeenCalledWith('a1')
    })
  })

  it('执行正文追加操作成功后通知当前文档刷新', async () => {
    const action = makeAction({
      id: 'a1',
      toolName: 'append_document_content',
      args: { documentId: 'doc-1', content: '新的正文', mode: 'append' },
      summary: '追加正文内容（4 字）',
    })
    const listener = vi.fn()
    window.addEventListener(APP_EVENTS.documentContentChanged, listener)
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([action]))
    applyPendingActionMock.mockResolvedValue(
      ok({ ...action, status: 'applied', appliedAt: '2025-01-02T00:00:00Z' }),
    )

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('执行')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('执行'))

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    const event = listener.mock.calls[0]?.[0] as CustomEvent
    expect(event.detail).toEqual({
      documentId: 'doc-1',
      source: 'agent_pending_action',
      actionId: 'a1',
      messageId: 'msg-1',
    })

    window.removeEventListener(APP_EVENTS.documentContentChanged, listener)
  })

  it('点击「拒绝」触发 rejectPendingAction', async () => {
    const action = makeAction({ id: 'a1' })
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([action]))
    rejectPendingActionMock.mockResolvedValue(
      ok({ ...action, status: 'rejected', appliedAt: '2025-01-02T00:00:00Z' }),
    )

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('拒绝')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('拒绝'))

    await waitFor(() => {
      expect(rejectPendingActionMock).toHaveBeenCalledWith('a1')
    })
  })

  it('applied 状态的操作不显示执行/拒绝按钮', async () => {
    const action = makeAction({ id: 'a1', status: 'applied', appliedAt: '2025-01-02T00:00:00Z' })
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([action]))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('创建大纲节点「第一章」')).toBeInTheDocument()
    })

    // applied 状态显示标签
    expect(screen.getByText('已执行')).toBeInTheDocument()
    // 不显示执行/拒绝按钮
    expect(screen.queryByText('执行')).not.toBeInTheDocument()
    expect(screen.queryByText('拒绝')).not.toBeInTheDocument()
    // 没有 pending 项，不显示全部执行按钮
    expect(screen.queryByText(/全部执行/)).not.toBeInTheDocument()
  })

  it('rejected 状态的操作不显示执行/拒绝按钮', async () => {
    const action = makeAction({ id: 'a1', status: 'rejected', appliedAt: '2025-01-02T00:00:00Z' })
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok([action]))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('创建大纲节点「第一章」')).toBeInTheDocument()
    })

    expect(screen.getByText('已拒绝')).toBeInTheDocument()
    expect(screen.queryByText('执行')).not.toBeInTheDocument()
    expect(screen.queryByText('拒绝')).not.toBeInTheDocument()
  })

  it('点击标题可收起/展开操作列表', async () => {
    const actions = [
      makeAction({ id: 'a1', summary: '创建大纲节点「第一章」' }),
      makeAction({ id: 'a2', toolName: 'create_card', summary: '创建卡片「角色卡」' }),
    ]
    listPendingActionsByMessageServiceMock.mockResolvedValue(ok(actions))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('待确认操作')).toBeInTheDocument()
    })

    // 默认展开：列表项可见
    expect(screen.getByText('创建大纲节点「第一章」')).toBeInTheDocument()
    expect(screen.getByText('创建卡片「角色卡」')).toBeInTheDocument()

    // 点击标题收起
    fireEvent.click(screen.getByText('待确认操作'))
    expect(screen.queryByText('创建大纲节点「第一章」')).not.toBeInTheDocument()
    expect(screen.queryByText('创建卡片「角色卡」')).not.toBeInTheDocument()
    // 收起后「全部执行」按钮也隐藏
    expect(screen.queryByText(/全部执行/)).not.toBeInTheDocument()

    // 再次点击展开
    fireEvent.click(screen.getByText('待确认操作'))
    expect(screen.getByText('创建大纲节点「第一章」')).toBeInTheDocument()
    expect(screen.getByText('创建卡片「角色卡」')).toBeInTheDocument()
  })

  it('点击「全部执行」触发 applyAllPendingActions', async () => {
    const actions = [
      makeAction({ id: 'a1' }),
      makeAction({ id: 'a2', toolName: 'create_card', summary: '创建卡片' }),
    ]
    listPendingActionsByMessageServiceMock
      .mockResolvedValueOnce(ok(actions))
      // applyAll 后重新拉取返回空（模拟全部已执行）
      .mockResolvedValueOnce(ok([]))
    applyAllPendingActionsMock.mockResolvedValue(ok({ applied: 2, failed: 0, failedIds: [] }))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(screen.getByText('全部执行（2）')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('全部执行（2）'))

    await waitFor(() => {
      expect(applyAllPendingActionsMock).toHaveBeenCalledWith('msg-1')
    })
  })

  it('收到待确认操作变更事件后重新加载列表', async () => {
    const action = makeAction({ id: 'a1', summary: '追加正文内容（20 字）' })
    listPendingActionsByMessageServiceMock
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([action]))

    render(<PendingActionList messageId="msg-1" />)

    await waitFor(() => {
      expect(listPendingActionsByMessageServiceMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('追加正文内容（20 字）')).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new CustomEvent(APP_EVENTS.agentPendingActionsChanged, {
          detail: { messageId: 'msg-1' },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('追加正文内容（20 字）')).toBeInTheDocument()
    })
    expect(listPendingActionsByMessageServiceMock).toHaveBeenCalledTimes(2)
  })
})
