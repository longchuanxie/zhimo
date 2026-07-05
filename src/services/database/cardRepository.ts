// 卡片 Repository
// 对应表：cards
// 负责所有卡片相关的数据库访问

import type { Card, CardStatus, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now, parseStringArray, stringifyStringArray } from './mapping'

// ============ 行映射 ============

const CARD_FIELD_MAP: Record<keyof Card, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  type: 'type',
  content: 'content',
  summary: 'summary',
  status: 'status',
  tags: 'tags',
  sourceId: 'source_id',
  sourceChunkId: 'source_chunk_id',
  sourceDocumentId: 'source_document_id',
  sourceAgentMessageId: 'source_agent_message_id',
  aiUsageAllowed: 'ai_usage_allowed',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapCard(row: Record<string, unknown>): Card {
  const card = mapRow<Card>(row, CARD_FIELD_MAP)
  return {
    ...card,
    tags: parseStringArray(card.tags),
    aiUsageAllowed: Boolean(card.aiUsageAllowed),
    isDeleted: Boolean(card.isDeleted),
  }
}

// ============ 查询 ============

/// 查询项目的卡片列表（未软删除）
export async function listCards(
  projectId: EntityId,
  status?: CardStatus,
): Promise<Card[]> {
  if (status) {
    const rows = await select<Record<string, unknown>>(
      'SELECT * FROM cards WHERE project_id = ? AND status = ? AND is_deleted = 0 ORDER BY updated_at DESC',
      [projectId, status],
    )
    return rows.map(mapCard)
  }

  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM cards WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [projectId],
  )
  return rows.map(mapCard)
}

/// 统计项目下未删除的卡片数量
export async function countCardsByProject(projectId: EntityId): Promise<number> {
  const rows = await select<{ count: number }>(
    'SELECT COUNT(*) AS count FROM cards WHERE project_id = ? AND is_deleted = 0',
    [projectId],
  )
  return rows[0]?.count ?? 0
}

/// 根据 ID 查询卡片
export async function findCardById(id: EntityId): Promise<Card | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM cards WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapCard(rows[0]!)
}

// ============ 写入 ============

/// 创建卡片
export async function insertCard(input: {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  content: string
  summary: string | null
  tags: string[] | null
  sourceId: EntityId | null
  sourceChunkId: EntityId | null
  sourceDocumentId: EntityId | null
  aiUsageAllowed: boolean
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO cards (
      id, project_id, title, type, content, summary, status, tags,
      source_id, source_chunk_id, source_document_id, source_agent_message_id,
      ai_usage_allowed, is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.type,
      input.content,
      input.summary,
      stringifyStringArray(input.tags),
      input.sourceId,
      input.sourceChunkId,
      input.sourceDocumentId,
      input.aiUsageAllowed ? 1 : 0,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新卡片内容
export async function updateCardContent(
  id: EntityId,
  patch: Partial<{
    title: string
    content: string
    summary: string
    tags: string[]
    type: string
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.title !== undefined) {
    fields.push('title = ?')
    params.push(patch.title)
  }
  if (patch.content !== undefined) {
    fields.push('content = ?')
    params.push(patch.content)
  }
  if (patch.summary !== undefined) {
    fields.push('summary = ?')
    params.push(patch.summary)
  }
  if (patch.tags !== undefined) {
    fields.push('tags = ?')
    params.push(stringifyStringArray(patch.tags))
  }
  if (patch.type !== undefined) {
    fields.push('type = ?')
    params.push(patch.type)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(
    `UPDATE cards SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 更新卡片状态
export async function updateCardStatus(
  id: EntityId,
  status: CardStatus,
): Promise<void> {
  await execute(
    'UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [status, now(), id],
  )
}

/// 更新卡片 AI 使用权限
export async function updateCardAiUsage(
  id: EntityId,
  allowed: boolean,
): Promise<void> {
  await execute(
    'UPDATE cards SET ai_usage_allowed = ?, updated_at = ? WHERE id = ?',
    [allowed ? 1 : 0, now(), id],
  )
}

/// 软删除卡片
export async function softDeleteCard(id: EntityId): Promise<void> {
  await execute(
    'UPDATE cards SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
