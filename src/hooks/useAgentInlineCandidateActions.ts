// 编辑器内 Agent 候选操作 Hook
// 将候选面板的执行/放弃操作封装起来，组件不直接调用待确认操作 Service。

import { useCallback, useState } from 'react'
import type { AgentInlineCandidate } from '@/stores/appStore'
import { useAppStore } from '@/stores/appStore'
import {
  applyPendingAction,
  rejectPendingAction,
} from '@/services/agent/PendingActionService'
import { APP_EVENTS, type DocumentContentChangedDetail } from '@/constants/events'

export function useAgentInlineCandidateActions(candidate: AgentInlineCandidate) {
  const setAgentInlineCandidate = useAppStore((s) => s.setAgentInlineCandidate)
  const [processing, setProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const applyCandidate = useCallback(async () => {
    if (!candidate || processing) return

    setProcessing(true)
    setErrorMessage(null)
    const result = await applyPendingAction(candidate.actionId)
    setProcessing(false)

    if (!result.ok) {
      setErrorMessage(result.error.message)
      return
    }

    notifyDocumentChanged(candidate)
    setAgentInlineCandidate(null)
  }, [candidate, processing, setAgentInlineCandidate])

  const rejectCandidate = useCallback(async () => {
    if (!candidate || processing) return

    setProcessing(true)
    setErrorMessage(null)
    const result = await rejectPendingAction(candidate.actionId)
    setProcessing(false)

    if (!result.ok) {
      setErrorMessage(result.error.message)
      return
    }

    setAgentInlineCandidate(null)
  }, [candidate, processing, setAgentInlineCandidate])

  const dismissCandidate = useCallback(() => {
    setAgentInlineCandidate(null)
  }, [setAgentInlineCandidate])

  return {
    processing,
    errorMessage,
    applyCandidate,
    rejectCandidate,
    dismissCandidate,
  }
}

function notifyDocumentChanged(candidate: NonNullable<AgentInlineCandidate>) {
  const detail: DocumentContentChangedDetail = {
    documentId: candidate.documentId,
    source: 'agent_pending_action',
    actionId: candidate.actionId,
    messageId: candidate.messageId,
  }
  window.dispatchEvent(
    new CustomEvent(APP_EVENTS.documentContentChanged, { detail }),
  )
}
