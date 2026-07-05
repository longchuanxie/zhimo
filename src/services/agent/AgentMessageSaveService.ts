// Agent 消息另存 Service
// 负责把助手回复保存为卡片或知识，并回填消息采纳状态。

import type { AgentMessage, Card, Knowledge } from '@/types'
import type { AppError } from '@/types/error'
import type { ServiceResult } from '@/types/service'
import { err, fromUnknown, ok } from '@/types/service'
import { createCard } from '@/services/card/CardService'
import { createKnowledge } from '@/services/knowledge/KnowledgeService'
import { updateMessageAdoptionService } from '@/services/agent/AgentService'

export type SavedAgentMessageCard = {
  objectType: 'card'
  card: Card
}

export type SavedAgentMessageKnowledge = {
  objectType: 'knowledge'
  knowledge: Knowledge
}

export async function saveAgentMessageAsCard(
  message: AgentMessage,
): Promise<ServiceResult<SavedAgentMessageCard>> {
  try {
    const cardResult = await createCard({
      projectId: message.projectId,
      title: extractAgentMessageTitle(message.content),
      type: 'ai_generated',
      content: message.content,
      summary: message.content.slice(0, 100),
      aiUsageAllowed: true,
    })

    if (!cardResult.ok) {
      return err(prefixError(cardResult.error, '卡片创建失败'))
    }

    const adoptionResult = await updateMessageAdoptionService({
      messageId: message.id,
      adoptionStatus: 'saved_as_card',
      savedAsCardId: cardResult.data.id,
    })
    if (!adoptionResult.ok) {
      return err(prefixError(adoptionResult.error, '消息状态更新失败'))
    }

    return ok({ objectType: 'card', card: cardResult.data })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export async function saveAgentMessageAsKnowledge(
  message: AgentMessage,
): Promise<ServiceResult<SavedAgentMessageKnowledge>> {
  try {
    const knowledgeResult = await createKnowledge({
      projectId: message.projectId,
      title: extractAgentMessageTitle(message.content),
      type: 'ai_generated',
      content: message.content,
      summary: message.content.slice(0, 100),
      sourceType: 'agent',
      aiUsageAllowed: true,
      confidence: 0.7,
    })

    if (!knowledgeResult.ok) {
      return err(prefixError(knowledgeResult.error, '知识创建失败'))
    }

    const adoptionResult = await updateMessageAdoptionService({
      messageId: message.id,
      adoptionStatus: 'saved_as_knowledge',
      savedAsKnowledgeId: knowledgeResult.data.id,
    })
    if (!adoptionResult.ok) {
      return err(prefixError(adoptionResult.error, '消息状态更新失败'))
    }

    return ok({ objectType: 'knowledge', knowledge: knowledgeResult.data })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export function extractAgentMessageTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (firstLine) {
    return firstLine.replace(/^#+\s*/, '').replace(/[*_`]/g, '').slice(0, 50)
  }

  return content.slice(0, 30).trim() || 'AI 生成内容'
}

function prefixError(error: AppError, prefix: string): AppError {
  return {
    ...error,
    message: `${prefix}：${error.message}`,
  }
}
