// useObjectAgentCommand 回归测试
// 验证对象级助手入口只派发 Agent 动作，不在页面里拼接 prompt。

import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'

const { useObjectAgentCommand } = await import('./useObjectAgentCommand')

beforeEach(() => {
  useAppStore.getState().setAgentPanelOpen(false)
  useAppStore.getState().setPendingAgentAction(null)
})

describe('useObjectAgentCommand', () => {
  it('成功时打开助手面板并写入对象级 pending action', () => {
    const { result } = renderHook(() => useObjectAgentCommand())

    act(() => {
      const ok = result.current.runObjectAgentCommand({
        projectId: 'project-1',
        command: 'expand_card',
        objectType: 'card',
        objectId: 'card-1',
        objectTitle: '角色卡',
      })
      expect(ok).toBe(true)
    })

    const state = useAppStore.getState()
    expect(state.agentPanelOpen).toBe(true)
    expect(state.pendingAgentAction).toMatchObject({
      taskType: 'answer_question',
      boundObjectType: 'card',
      boundObjectId: 'card-1',
      contextScope: 'current_object',
      autoSubmit: true,
    })
    expect(state.pendingAgentAction?.template).toContain('请扩展卡片「角色卡」。')
  })

  it('校验失败时不打开助手面板', () => {
    const { result } = renderHook(() => useObjectAgentCommand())

    act(() => {
      const ok = result.current.runObjectAgentCommand({
        projectId: '',
        command: 'expand_card',
        objectType: 'card',
        objectId: 'card-1',
        objectTitle: '角色卡',
      })
      expect(ok).toBe(false)
    })

    const state = useAppStore.getState()
    expect(state.agentPanelOpen).toBe(false)
    expect(state.pendingAgentAction).toBeNull()
    expect(result.current.errorMessage).toBe('项目 ID 不能为空')
  })
})
