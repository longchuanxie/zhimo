// 对象级 Agent 命令 Hook
// 页面提交当前对象与命令，Hook 负责调用命令 Service 并派发到 Agent 面板。

import { useCallback, useState } from 'react'
import type { BoundObjectType } from '@/types'
import {
  createObjectAgentAction,
  type ObjectAgentCommand,
} from '@/services/agent/AgentCommandService'
import { useAppStore } from '@/stores/appStore'

export type RunObjectAgentCommandInput = {
  projectId: string
  command: ObjectAgentCommand
  objectType: BoundObjectType
  objectId: string
  objectTitle: string
}

export function useObjectAgentCommand() {
  const setAgentPanelOpen = useAppStore((s) => s.setAgentPanelOpen)
  const setPendingAgentAction = useAppStore((s) => s.setPendingAgentAction)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runObjectAgentCommand = useCallback(
    (input: RunObjectAgentCommandInput): boolean => {
      setErrorMessage(null)
      const result = createObjectAgentAction(input)
      if (!result.ok) {
        setErrorMessage(result.error.message)
        return false
      }

      setAgentPanelOpen(true)
      setPendingAgentAction(result.data)
      return true
    },
    [setAgentPanelOpen, setPendingAgentAction],
  )

  return {
    errorMessage,
    clearError: () => setErrorMessage(null),
    runObjectAgentCommand,
  }
}
