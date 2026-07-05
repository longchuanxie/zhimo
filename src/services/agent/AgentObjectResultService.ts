// 对象级 Agent 成果查询 Service
// 负责聚合绑定到写作对象的助手线程中，已采纳或已保存的助手消息。

import type {
  AdoptionStatus,
  AgentMessage,
  AgentThread,
  BoundObjectType,
  EntityId,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { err, fromUnknown, ok } from '@/types/service'
import { VALIDATION_ERROR } from '@/constants/errors'
import {
  findThreadByBoundObject,
  listMessages,
} from '@/services/database/agentRepository'

export type AgentObjectResultItem = {
  id: EntityId
  threadId: EntityId
  messageId: EntityId
  adoptionStatus: Extract<
    AdoptionStatus,
    'applied' | 'saved_as_card' | 'saved_as_knowledge'
  >
  contentPreview: string
  savedAsCardId: EntityId | null
  savedAsKnowledgeId: EntityId | null
  createdAt: string
}

export type AgentObjectResults = {
  thread: AgentThread | null
  items: AgentObjectResultItem[]
}

export type ListAgentObjectResultsInput = {
  projectId: EntityId
  boundObjectType: BoundObjectType
  boundObjectId: EntityId
  limit?: number
}

const RESULT_STATUSES = new Set<AdoptionStatus>([
  'applied',
  'saved_as_card',
  'saved_as_knowledge',
])

export async function listAgentObjectResults(
  input: ListAgentObjectResultsInput,
): Promise<ServiceResult<AgentObjectResults>> {
  try {
    const projectId = input.projectId.trim()
    const boundObjectId = input.boundObjectId.trim()
    const limit = input.limit ?? 5

    if (!projectId) return err(validationError('项目 ID 不能为空'))
    if (!boundObjectId) return err(validationError('对象 ID 不能为空'))
    if (limit <= 0) return err(validationError('结果数量必须大于 0'))

    const thread = await findThreadByBoundObject(
      projectId,
      input.boundObjectType,
      boundObjectId,
    )
    if (!thread) return ok({ thread: null, items: [] })

    const messages = await listMessages(thread.id, 100)
    const items = messages
      .filter(isResultMessage)
      .slice(-limit)
      .reverse()
      .map(toResultItem)

    return ok({ thread, items })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

function isResultMessage(
  message: AgentMessage,
): message is AgentMessage & {
  adoptionStatus: AgentObjectResultItem['adoptionStatus']
} {
  return message.role === 'assistant' && RESULT_STATUSES.has(message.adoptionStatus)
}

function toResultItem(
  message: AgentMessage & {
    adoptionStatus: AgentObjectResultItem['adoptionStatus']
  },
): AgentObjectResultItem {
  return {
    id: message.id,
    threadId: message.threadId,
    messageId: message.id,
    adoptionStatus: message.adoptionStatus,
    contentPreview: buildContentPreview(message.content),
    savedAsCardId: message.savedAsCardId,
    savedAsKnowledgeId: message.savedAsKnowledgeId,
    createdAt: message.createdAt,
  }
}

function buildContentPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized
}

function validationError(message: string) {
  return {
    code: VALIDATION_ERROR,
    message,
    retryable: false,
  }
}
