// 外部 Agent 动作消费 Hook
// 负责将选区菜单、对象详情页等入口派发的 pendingAgentAction 转换为线程与上下文预览。

import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import {
  createThread,
  getOrCreateThreadByBoundObject,
} from '@/services/agent/AgentService'
import type { AgentTaskType, AgentThread } from '@/types'
import type { AppError } from '@/types/error'

type UsePendingAgentActionConsumerOptions = {
  projectId?: string
  currentThread: AgentThread | null
  onThreadSelected: (thread: AgentThread) => void
  onThreadReset: () => void
  onThreadsChanged: () => void
  onDraftPrepared: (input: {
    template: string
    taskType: AgentTaskType
  }) => void
  onPrepareSend: (
    content: string,
    taskType: AgentTaskType,
    thread: AgentThread,
    options?: { autoSubmit?: boolean },
  ) => Promise<void>
  onError: (error: AppError) => void
}

export function usePendingAgentActionConsumer({
  projectId,
  currentThread,
  onThreadSelected,
  onThreadReset,
  onThreadsChanged,
  onDraftPrepared,
  onPrepareSend,
  onError,
}: UsePendingAgentActionConsumerOptions) {
  const pendingAgentAction = useAppStore((s) => s.pendingAgentAction)
  const setPendingAgentAction = useAppStore((s) => s.setPendingAgentAction)

  useEffect(() => {
    if (!pendingAgentAction || !projectId) return

    const {
      taskType,
      template,
      boundObjectType,
      boundObjectId,
      contextScope,
      threadTitle,
      autoSubmit,
    } = pendingAgentAction

    setPendingAgentAction(null)
    onDraftPrepared({ template, taskType })

    void (async () => {
      let thread = currentThread

      if (boundObjectType && boundObjectId) {
        const threadResult = await getOrCreateThreadByBoundObject({
          projectId,
          agentRole: 'writing_assistant',
          boundObjectType,
          boundObjectId,
          title: threadTitle ?? buildDefaultAgentThreadTitle(),
          contextScope: contextScope ?? 'current_object',
        })
        if (!threadResult.ok) {
          onError(threadResult.error)
          return
        }

        thread = threadResult.data
        onThreadSelected(thread)
        onThreadReset()
        onThreadsChanged()
      }

      if (!thread) {
        const createResult = await createThread({
          projectId,
          agentRole: 'writing_assistant',
          boundObjectType: 'project',
          boundObjectId: projectId,
          title: buildDefaultAgentThreadTitle(),
          contextScope: 'whole_project',
        })
        if (!createResult.ok) {
          onError(createResult.error)
          return
        }

        thread = createResult.data
        onThreadSelected(thread)
        onThreadReset()
        onThreadsChanged()
      }

      await onPrepareSend(template, taskType, thread, { autoSubmit })
    })()
  }, [
    currentThread,
    onDraftPrepared,
    onError,
    onPrepareSend,
    onThreadReset,
    onThreadSelected,
    onThreadsChanged,
    pendingAgentAction,
    projectId,
    setPendingAgentAction,
  ])
}

export function buildDefaultAgentThreadTitle(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `新对话 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}
