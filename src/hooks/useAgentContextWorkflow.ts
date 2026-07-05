// Agent 上下文预览与发送工作流 Hook
// 封装 previewContext → createContextPack → sendMessage 的安全链路。

import { useRef, useState } from 'react'
import {
  getTaskContextLength,
  sendMessage,
} from '@/services/agent/AgentService'
import {
  createContextPack,
  previewContext,
} from '@/services/context/ContextService'
import type {
  AgentTaskType,
  AgentThread,
  ContextPreview,
} from '@/types'
import type { AppError } from '@/types/error'
import { fromUnknown } from '@/types/service'

type UseAgentContextWorkflowOptions = {
  projectId?: string
  currentThread: AgentThread | null
  input: string
  currentTaskType: AgentTaskType
  selectedText: string
  activeDocumentId: string | null
  onInputChange: (value: string) => void
  onTaskTypeChange: (taskType: AgentTaskType) => void
  onMessagesChanged: () => void
  onThreadsChanged: () => void
  onErrorChange: (error: AppError | null) => void
}

export function useAgentContextWorkflow({
  projectId,
  currentThread,
  input,
  currentTaskType,
  selectedText,
  activeDocumentId,
  onInputChange,
  onTaskTypeChange,
  onMessagesChanged,
  onThreadsChanged,
  onErrorChange,
}: UseAgentContextWorkflowOptions) {
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const prepareSend = async (
    content?: string,
    taskType?: AgentTaskType,
    thread?: AgentThread,
    options?: { autoSubmit?: boolean },
  ) => {
    const text = (content ?? input).trim()
    const effectiveTaskType = taskType ?? currentTaskType
    const effectiveThread = thread ?? currentThread

    if (!projectId || !effectiveThread || !text) return

    setPreviewLoading(true)
    onErrorChange(null)

    try {
      const modelMaxTokens = await getTaskContextLength(effectiveTaskType)
      const result = await previewContext({
        projectId,
        threadId: effectiveThread.id,
        taskType: effectiveTaskType,
        boundObjectType: effectiveThread.boundObjectType,
        boundObjectId: effectiveThread.boundObjectId ?? undefined,
        contextScope: effectiveThread.contextScope,
        userInstruction: text,
        selectedText: selectedText || undefined,
        modelMaxTokens: modelMaxTokens ?? undefined,
        currentDocumentId: activeDocumentId ?? undefined,
      })

      if (result.ok) {
        setContextPreview(result.data)
        if (options?.autoSubmit) {
          await submitContextPreview(
            result.data,
            text,
            effectiveTaskType,
            effectiveThread,
            [],
          )
        }
      } else {
        onErrorChange(result.error)
      }
    } catch (error) {
      onErrorChange(fromUnknown(error))
    } finally {
      setPreviewLoading(false)
    }
  }

  const confirmContextPack = async (excludedRefIds: string[]) => {
    if (!contextPreview || !projectId || !currentThread) return

    await submitContextPreview(
      contextPreview,
      input.trim(),
      currentTaskType,
      currentThread,
      excludedRefIds,
    )
  }

  const submitContextPreview = async (
    preview: ContextPreview,
    content: string,
    taskType: AgentTaskType,
    thread: AgentThread,
    excludedRefIds: string[],
  ) => {
    if (!projectId || !content.trim()) return

    setSending(true)
    onErrorChange(null)

    const packResult = await createContextPack({
      ...preview,
      entries: preview.entries.map((entry) => ({
        ...entry,
        excluded:
          entry.required || !entry.refId
            ? false
            : excludedRefIds.includes(entry.refId),
      })),
      userConfirmed: true,
    })

    if (!packResult.ok) {
      setSending(false)
      onErrorChange(packResult.error)
      return
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const sendResult = await sendMessage({
      projectId,
      threadId: thread.id,
      content: content.trim(),
      contextPackId: packResult.data.id,
      taskType,
      signal: abortController.signal,
    })

    abortControllerRef.current = null
    setSending(false)

    if (sendResult.ok) {
      onInputChange('')
      setContextPreview(null)
      onTaskTypeChange('answer_question')
      onMessagesChanged()
      onThreadsChanged()
    } else if (sendResult.error.code === 'OPERATION_CANCELLED') {
      onMessagesChanged()
    } else if (sendResult.error.code === 'MODEL_CONTEXT_COMPACT_FAILED') {
      onErrorChange({
        code: 'MODEL_CONTEXT_COMPACT_FAILED',
        message: '上下文过大，自动压缩后仍超出模型上限。请在下方预览中排除部分可选内容后重试。',
        retryable: false,
      })
    } else {
      onErrorChange(sendResult.error)
    }
  }

  const cancelSend = () => {
    abortControllerRef.current?.abort()
  }

  return {
    contextPreview,
    previewLoading,
    sending,
    prepareSend,
    confirmContextPack,
    cancelSend,
    clearContextPreview: () => setContextPreview(null),
  }
}
