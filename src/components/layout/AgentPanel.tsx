// 智能助手面板（右侧栏）
// 对应任务：DEV-072 / DEV-073 / DEV-074
// 对应文档：06_工程实施补齐/06_Agent提示词与ContextPack组装规则_v1.0.md
//
// 职责：
// - 显示当前项目的助手对话线程
// - 支持创建新线程（默认绑定到 project）
// - 发送消息（含上下文预览 → 确认 → 调用模型）
// - 展示消息列表（含解释区、操作条）
// - 快捷动作
//
// MVP 简化：
// - 默认绑定到 project（boundObjectType = 'project'）
// - 上下文范围默认 current_object（即 project 本身）
// - 用户可手动切换 whole_project 模式

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { usePendingAgentActionConsumer } from '@/hooks/usePendingAgentActionConsumer'
import { useAgentContextWorkflow } from '@/hooks/useAgentContextWorkflow'
import { useAgentThreadWorkflow } from '@/hooks/useAgentThreadWorkflow'
import { AgentPanelHeader } from '@/components/agent/AgentPanelHeader'
import { AgentThreadTabs } from '@/components/agent/AgentThreadTabs'
import { AgentPanelErrorBanner } from '@/components/agent/AgentPanelErrorBanner'
import { AgentRunProgressBanner } from '@/components/agent/AgentRunProgressBanner'
import { AgentConversationArea } from '@/components/agent/AgentConversationArea'
import type { QuickAction } from '@/components/agent/AgentQuickActions'
import { ContextPreviewPanel } from '@/components/agent/ContextPreviewPanel'
import { AgentThreadStateCard } from '@/components/agent/AgentThreadStateCard'
import { useMessageActions } from '@/components/agent/useMessageActions'
import { AlertDialog } from '@/components/foundation/Modal'
import type { AgentThreadState, AgentTaskType } from '@/types'
import type { AppError } from '@/types/error'

const CONTINUE_INSTRUCTION_REQUIREMENT =
  '执行要求：请先识别真实意图并检查目标文档状态；需要写入时请生成待确认操作，不要只输出大纲或说明。'

export function AgentPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const agentPanelOpen = useAppStore((s) => s.agentPanelOpen)
  const selectedText = useAppStore((s) => s.selectedText)
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)

  // 输入状态
  const [input, setInput] = useState('')
  const [currentTaskType, setCurrentTaskType] = useState<AgentTaskType>('answer_question')

  // 错误状态
  const [error, setError] = useState<AppError | null>(null)

  const {
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
  } = useAgentThreadWorkflow({
    projectId,
    agentPanelOpen,
    onErrorChange: setError,
  })

  // 消息操作（采纳/拒绝/保存为卡片/保存为知识）
  const {
    alertMessage,
    setAlertMessage,
    adopt,
    reject,
    saveAsCard,
    saveAsKnowledge,
  } = useMessageActions({ onMessagesChanged: handleMessagesChanged })

  // 快捷动作
  const handleQuickAction = (action: QuickAction) => {
    setInput(action.template)
    setCurrentTaskType(action.taskType)
  }

  const handleContinueThread = () => {
    setInput(buildContinueInstruction(threadState))
    setCurrentTaskType('answer_question')
  }

  const {
    contextPreview,
    previewLoading,
    sending,
    prepareSend,
    confirmContextPack,
    cancelSend,
    clearContextPreview,
  } = useAgentContextWorkflow({
    projectId,
    currentThread,
    input,
    currentTaskType,
    selectedText,
    activeDocumentId,
    onInputChange: setInput,
    onTaskTypeChange: setCurrentTaskType,
    onMessagesChanged: handleMessagesChanged,
    onThreadsChanged: loadThreads,
    onErrorChange: setError,
  })

  usePendingAgentActionConsumer({
    projectId,
    currentThread,
    onThreadSelected: setCurrentThread,
    onThreadReset: resetThreadContent,
    onThreadsChanged: loadThreads,
    onDraftPrepared: ({ template, taskType }) => {
      setCurrentTaskType(taskType)
      setInput(template)
    },
    onPrepareSend: prepareSend,
    onError: setError,
  })

  if (!agentPanelOpen || !projectId) {
    return null
  }

  return (
    <aside className="flex flex-col w-[390px] border-l border-line bg-surface-2/50 overflow-hidden flex-shrink-0">
      <AgentPanelHeader
        onRefresh={loadThreads}
        onCreateThread={handleCreateThread}
      />

      <AgentThreadTabs
        threads={threads}
        currentThreadId={currentThread?.id}
        onSelectThread={handleSelectThread}
      />

      <AgentPanelErrorBanner error={error} />

      <AgentRunProgressBanner
        previewLoading={previewLoading}
        sending={sending}
      />

      {!contextPreview && currentThread && (
        <AgentThreadStateCard
          state={threadState}
          onContinue={handleContinueThread}
        />
      )}

      {/* 上下文预览模式 */}
      {contextPreview ? (
        <ContextPreviewPanel
          preview={contextPreview}
          creating={sending}
          onCreateContextPack={confirmContextPack}
          onCancel={clearContextPreview}
          onAbort={cancelSend}
        />
      ) : (
        <AgentConversationArea
          messageList={{
            currentThread,
            messages,
            loading: loadingThreads || loadingMessages,
            onCreateThread: handleCreateThread,
            onAdopt: adopt,
            onReject: reject,
            onSaveAsCard: saveAsCard,
            onSaveAsKnowledge: saveAsKnowledge,
          }}
          quickActions={{
            hasSelection: !!selectedText,
            onAction: handleQuickAction,
          }}
          inputArea={{
            input,
            onInputChange: setInput,
            taskType: currentTaskType,
            onClearTaskType: () => {
              setCurrentTaskType('answer_question')
              setInput('')
            },
            onSend: prepareSend,
            sending,
            previewLoading,
          }}
        />
      )}

      {/* 提示弹框 */}
      <AlertDialog
        open={alertMessage !== null}
        title="提示"
        message={alertMessage ?? ''}
        onClose={() => setAlertMessage(null)}
      />
    </aside>
  )
}

function buildContinueInstruction(state: AgentThreadState | null): string {
  const goal = state?.currentGoal?.trim()
  const lines = [
    goal
      ? '请继续推进当前协作目标。'
      : '请基于当前对话继续推进上一轮任务。',
  ]

  if (goal) {
    lines.push(`任务目标：${goal}`)
  }

  const acceptedCount = state?.acceptedDecisions.length ?? 0
  if (acceptedCount > 0) {
    lines.push(`参考约束：沿用最近已采纳的方向（${acceptedCount} 条）。`)
  }

  const rejectedCount = state?.rejectedDirections.length ?? 0
  if (rejectedCount > 0) {
    lines.push(`规避方向：不要重复已拒绝的方向（${rejectedCount} 条）。`)
  }

  lines.push(CONTINUE_INSTRUCTION_REQUIREMENT)
  return lines.join('\n')
}
