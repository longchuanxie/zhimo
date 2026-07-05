// useAgentInlineCandidateActions 回归测试
// 验证编辑器内联候选仍通过 PendingAction 安全落地。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAppStore, type AgentInlineCandidate } from '@/stores/appStore'
import { APP_EVENTS } from '@/constants/events'

const applyPendingActionMock = vi.fn()
const rejectPendingActionMock = vi.fn()

vi.mock('@/services/agent/PendingActionService', () => ({
  applyPendingAction: (...args: unknown[]) => applyPendingActionMock(...args),
  rejectPendingAction: (...args: unknown[]) => rejectPendingActionMock(...args),
}))

const { useAgentInlineCandidateActions } = await import('./useAgentInlineCandidateActions')

const candidate: NonNullable<AgentInlineCandidate> = {
  actionId: 'action-1',
  messageId: 'msg-1',
  documentId: 'doc-1',
  content: '新的正文内容',
  summary: '替换当前选区',
  mode: 'replace_selection',
  selectedText: '旧正文',
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.getState().setAgentInlineCandidate(candidate)
})

describe('useAgentInlineCandidateActions', () => {
  it('执行候选时调用 applyPendingAction，并通知文档刷新', async () => {
    const listener = vi.fn()
    window.addEventListener(APP_EVENTS.documentContentChanged, listener)
    applyPendingActionMock.mockResolvedValue({
      ok: true,
      data: {
        id: 'action-1',
        messageId: 'msg-1',
        projectId: 'p1',
        threadId: 't1',
        toolName: 'append_document_content',
        args: { documentId: 'doc-1' },
        summary: '替换当前选区',
        status: 'applied',
        createdAt: '2026-01-01T00:00:00.000Z',
        appliedAt: '2026-01-01T00:01:00.000Z',
      },
    })

    const { result } = renderHook(() => useAgentInlineCandidateActions(candidate))

    await act(async () => {
      await result.current.applyCandidate()
    })

    expect(applyPendingActionMock).toHaveBeenCalledWith('action-1')
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0]?.[0] as CustomEvent
    expect(event.detail).toEqual({
      documentId: 'doc-1',
      source: 'agent_pending_action',
      actionId: 'action-1',
      messageId: 'msg-1',
    })
    expect(useAppStore.getState().agentInlineCandidate).toBeNull()

    window.removeEventListener(APP_EVENTS.documentContentChanged, listener)
  })

  it('放弃候选时调用 rejectPendingAction，并清空候选', async () => {
    rejectPendingActionMock.mockResolvedValue({
      ok: true,
      data: {
        id: 'action-1',
        messageId: 'msg-1',
        projectId: 'p1',
        threadId: 't1',
        toolName: 'append_document_content',
        args: { documentId: 'doc-1' },
        summary: '替换当前选区',
        status: 'rejected',
        createdAt: '2026-01-01T00:00:00.000Z',
        appliedAt: '2026-01-01T00:01:00.000Z',
      },
    })

    const { result } = renderHook(() => useAgentInlineCandidateActions(candidate))

    await act(async () => {
      await result.current.rejectCandidate()
    })

    expect(rejectPendingActionMock).toHaveBeenCalledWith('action-1')
    expect(useAppStore.getState().agentInlineCandidate).toBeNull()
  })
})
