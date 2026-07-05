// 智能助手消息操作 Hook
// 封装 AgentPanel 中消息采纳/拒绝/保存为卡片/保存为知识的交互调度
//
// 职责：
// - adopt：根据任务类型将 AI 回复调度到文档/卡片/知识/大纲
// - reject：标记消息为已拒绝
// - saveAsCard：调用服务保存为卡片并提示结果
// - saveAsKnowledge：调用服务保存为知识并提示结果

import { useState } from 'react'
import type { AgentMessage, AgentTaskType, PendingToolAction } from '@/types'
import {
  updateMessageAdoptionService,
} from '@/services/agent/AgentService'
import { getContextPack } from '@/services/context/ContextService'
import { inferAdoptDestination } from '@/services/agent/AdoptionIntentService'
import {
  recordAcceptedDecision,
  recordRejectedDirection,
} from '@/services/agent/AgentThreadStateService'
import { createPendingActionFromAdoption } from '@/services/agent/PendingActionService'
import {
  saveAgentMessageAsCard,
  saveAgentMessageAsKnowledge,
} from '@/services/agent/AgentMessageSaveService'
import { useAppStore } from '@/stores/appStore'
import { APP_EVENTS } from '@/constants/events'

type UseMessageActionsOptions = {
  /// 消息列表刷新回调
  onMessagesChanged: () => void
}

export function useMessageActions({ onMessagesChanged }: UseMessageActionsOptions) {
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)
  const selectedText = useAppStore((s) => s.selectedText)
  const setAgentInlineCandidate = useAppStore((s) => s.setAgentInlineCandidate)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)

  /// 采纳：根据任务类型将内容调度到不同区域
  const adopt = async (message: AgentMessage) => {
    // 1. 通过 ContextPack 获取任务类型
    let taskType: AgentTaskType = 'answer_question'
    let userInstruction: string | null = null
    if (message.contextPackId) {
      const packResult = await getContextPack(message.contextPackId)
      if (packResult.ok && packResult.data) {
        taskType = packResult.data.taskType
        userInstruction = packResult.data.userInstruction
      }
    }

    // 2. 根据任务类型 + 回复内容推断采纳目标
    const destination = inferAdoptDestination({
      content: message.content,
      taskType,
      userInstruction,
    })

    const pendingResult = await createPendingActionFromAdoption({
      message,
      destination,
      activeDocumentId,
      selectedText,
    })
    if (!pendingResult.ok) {
      setAlertMessage(pendingResult.error.message)
      return
    }

    // 3. 更新消息状态：表示用户已选择采纳，真正写入仍需执行待确认操作
    const result = await updateMessageAdoptionService({
      messageId: message.id,
      adoptionStatus: 'applied',
    })
    if (result.ok) {
      const inlineCandidate = buildInlineCandidate(pendingResult.data)
      setAgentInlineCandidate(inlineCandidate)
      void recordAcceptedDecision({
        message,
        destination,
        title: pendingResult.data.summary,
      })
      notifyPendingActionsChanged(message.id)
      onMessagesChanged()
      setAlertMessage('已生成待确认操作，请在消息下方执行')
    }
  }

  /// 拒绝
  const reject = async (message: AgentMessage) => {
    const result = await updateMessageAdoptionService({
      messageId: message.id,
      adoptionStatus: 'rejected',
    })
    if (result.ok) {
      setAgentInlineCandidate(null)
      void recordRejectedDirection(message)
      onMessagesChanged()
    }
  }

  /// 保存为卡片
  const saveAsCard = async (message: AgentMessage) => {
    const result = await saveAgentMessageAsCard(message)
    if (!result.ok) {
      setAlertMessage(result.error.message)
      return
    }

    onMessagesChanged()
    setAlertMessage(`已保存为卡片「${result.data.card.title}」`)
  }

  /// 保存为知识
  const saveAsKnowledge = async (message: AgentMessage) => {
    const result = await saveAgentMessageAsKnowledge(message)
    if (!result.ok) {
      setAlertMessage(result.error.message)
      return
    }

    onMessagesChanged()
    setAlertMessage(`已保存为知识「${result.data.knowledge.title}」`)
  }

  return {
    alertMessage,
    setAlertMessage,
    adopt,
    reject,
    saveAsCard,
    saveAsKnowledge,
  }
}

function notifyPendingActionsChanged(messageId: string) {
  window.dispatchEvent(
    new CustomEvent(APP_EVENTS.agentPendingActionsChanged, {
      detail: { messageId },
    }),
  )
}

function buildInlineCandidate(action: PendingToolAction) {
  if (action.toolName !== 'append_document_content') return null

  const documentId = readStringArg(action.args, 'documentId')
  const content = readStringArg(action.args, 'content')
  if (!documentId || !content) return null

  const mode = readStringArg(action.args, 'mode')
  const selectedText = readStringArg(action.args, 'selectedText') ?? undefined

  return {
    actionId: action.id,
    messageId: action.messageId,
    documentId,
    content,
    summary: action.summary,
    mode: mode === 'replace_selection' ? 'replace_selection' : 'append',
    selectedText,
  } as const
}

function readStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
