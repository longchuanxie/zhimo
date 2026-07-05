import { useCallback, useEffect, useState } from 'react'
import { buildDefaultAgentThreadTitle } from '@/hooks/usePendingAgentActionConsumer'
import {
  createThread,
  listMessages,
  listThreads,
} from '@/services/agent/AgentService'
import { getThreadState } from '@/services/agent/AgentThreadStateService'
import type { AgentMessage, AgentThread, AgentThreadState } from '@/types'
import type { AppError } from '@/types/error'

type UseAgentThreadWorkflowOptions = {
  projectId?: string
  agentPanelOpen: boolean
  onErrorChange: (error: AppError | null) => void
}

export function useAgentThreadWorkflow({
  projectId,
  agentPanelOpen,
  onErrorChange,
}: UseAgentThreadWorkflowOptions) {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [currentThread, setCurrentThread] = useState<AgentThread | null>(null)
  const [threadState, setThreadState] = useState<AgentThreadState | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const resetThreadContent = useCallback(() => {
    setThreadState(null)
    setMessages([])
  }, [])

  const loadThreads = useCallback(async (options?: { autoSelectFirst?: boolean }) => {
    if (!projectId) return

    setLoadingThreads(true)
    const result = await listThreads(projectId)
    setLoadingThreads(false)

    if (result.ok) {
      setThreads(result.data)
      const autoSelectFirst = options?.autoSelectFirst ?? true
      if (autoSelectFirst && !currentThread && result.data.length > 0) {
        setCurrentThread(result.data[0]!)
      }
    } else {
      onErrorChange(result.error)
    }
  }, [currentThread, onErrorChange, projectId])

  const loadMessages = useCallback(async () => {
    if (!currentThread) return

    setLoadingMessages(true)
    const result = await listMessages(currentThread.id)
    setLoadingMessages(false)

    if (result.ok) {
      setMessages(result.data)
    } else {
      onErrorChange(result.error)
    }
  }, [currentThread, onErrorChange])

  const loadThreadState = useCallback(async () => {
    if (!currentThread) {
      setThreadState(null)
      return
    }

    const result = await getThreadState(currentThread.id)
    if (result.ok) {
      setThreadState(result.data)
    } else {
      onErrorChange(result.error)
    }
  }, [currentThread, onErrorChange])

  const handleMessagesChanged = useCallback(() => {
    loadMessages()
    loadThreadState()
  }, [loadMessages, loadThreadState])

  const handleCreateThread = useCallback(async () => {
    if (!projectId) return

    const result = await createThread({
      projectId,
      agentRole: 'writing_assistant',
      boundObjectType: 'project',
      boundObjectId: projectId,
      title: buildDefaultAgentThreadTitle(),
      contextScope: 'whole_project',
    })

    if (result.ok) {
      setCurrentThread(result.data)
      resetThreadContent()
      await loadThreads({ autoSelectFirst: false })
    } else {
      onErrorChange(result.error)
    }
  }, [loadThreads, onErrorChange, projectId, resetThreadContent])

  const handleSelectThread = useCallback(
    (thread: AgentThread) => {
      setCurrentThread(thread)
      setThreadState(null)
      onErrorChange(null)
    },
    [onErrorChange],
  )

  useEffect(() => {
    if (projectId && agentPanelOpen) {
      loadThreads()
    }
  }, [agentPanelOpen, loadThreads, projectId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    loadThreadState()
  }, [loadThreadState])

  return {
    threads,
    currentThread,
    threadState,
    messages,
    loadingThreads,
    loadingMessages,
    loadThreads,
    handleCreateThread,
    handleSelectThread,
    handleMessagesChanged,
    setCurrentThread,
    resetThreadContent,
  }
}
