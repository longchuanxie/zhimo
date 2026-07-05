// 卡片 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §6
// 负责卡片相关的业务逻辑：创建、编辑、状态流转

import type { Card, CardStatus } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  listCards as repoListCards,
  findCardById,
  insertCard,
  updateCardContent,
  updateCardStatus,
  updateCardAiUsage,
  softDeleteCard,
} from '@/services/database/cardRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateCardInput = {
  projectId: string
  title: string
  type: string
  content: string
  summary?: string
  tags?: string[]
  sourceId?: string
  sourceChunkId?: string
  sourceDocumentId?: string
  aiUsageAllowed?: boolean
}

export type UpdateCardInput = {
  cardId: string
  patch: Partial<{
    title: string
    content: string
    summary: string
    tags: string[]
    type: string
  }>
}

// ============ Service 方法 ============

/// 查询卡片列表
export async function listCards(
  projectId: string,
  status?: CardStatus,
): Promise<ServiceResult<Card[]>> {
  try {
    const cards = await repoListCards(projectId, status)
    return ok(cards)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询卡片详情
export async function getCard(cardId: string): Promise<ServiceResult<Card>> {
  try {
    const card = await findCardById(cardId)
    if (!card) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }
    return ok(card)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建卡片
export async function createCard(
  input: CreateCardInput,
): Promise<ServiceResult<Card>> {
  try {
    if (!input.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '卡片标题不能为空',
        retryable: false,
      })
    }

    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '卡片内容不能为空',
        retryable: false,
      })
    }

    const cardId = generateId()

    await insertCard({
      id: cardId,
      projectId: input.projectId,
      title: input.title.trim(),
      type: input.type || 'note',
      content: input.content,
      summary: input.summary ?? null,
      tags: input.tags ?? null,
      sourceId: input.sourceId ?? null,
      sourceChunkId: input.sourceChunkId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      aiUsageAllowed: input.aiUsageAllowed ?? true,
    })

    const card = await findCardById(cardId)
    if (!card) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '卡片创建后查询失败',
        retryable: true,
      })
    }

    return ok(card)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新卡片
export async function updateCard(
  input: UpdateCardInput,
): Promise<ServiceResult<Card>> {
  try {
    const card = await findCardById(input.cardId)
    if (!card) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    if (input.patch.title !== undefined && !input.patch.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '卡片标题不能为空',
        retryable: false,
      })
    }

    if (input.patch.content !== undefined && !input.patch.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '卡片内容不能为空',
        retryable: false,
      })
    }

    await updateCardContent(input.cardId, input.patch)

    const updated = await findCardById(input.cardId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新卡片状态
export async function updateCardStatusService(
  cardId: string,
  status: CardStatus,
): Promise<ServiceResult<Card>> {
  try {
    const card = await findCardById(cardId)
    if (!card) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    await updateCardStatus(cardId, status)

    const updated = await findCardById(cardId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新卡片 AI 使用权限
export async function updateCardAiUsageService(
  cardId: string,
  allowed: boolean,
): Promise<ServiceResult<Card>> {
  try {
    const card = await findCardById(cardId)
    if (!card) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    await updateCardAiUsage(cardId, allowed)

    const updated = await findCardById(cardId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除卡片（软删除）
export async function deleteCard(cardId: string): Promise<ServiceResult<void>> {
  try {
    const card = await findCardById(cardId)
    if (!card) {
      return err({
        code: NOT_FOUND,
        message: '卡片不存在',
        retryable: false,
      })
    }

    await softDeleteCard(cardId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
