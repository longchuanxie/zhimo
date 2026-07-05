// 知识库 Repository
// 对应表：knowledge
// 负责所有知识条目相关的数据库访问
// 知识库用于沉淀已确认的事实、设定、规则，供 AI 助手作为上下文参考

import type { Knowledge, KnowledgeStatus, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now } from './mapping'

// ============ 行映射 ============

const KNOWLEDGE_FIELD_MAP: Record<keyof Knowledge, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  type: 'type',
  content: 'content',
  summary: 'summary',
  status: 'status',
  sourceType: 'source_type',
  sourceId: 'source_id',
  aiUsageAllowed: 'ai_usage_allowed',
  confidence: 'confidence',
  version: 'version',
  replacedById: 'replaced_by_id',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapKnowledge(row: Record<string, unknown>): Knowledge {
  const knowledge = mapRow<Knowledge>(row, KNOWLEDGE_FIELD_MAP)
  return {
    ...knowledge,
    aiUsageAllowed: Boolean(knowledge.aiUsageAllowed),
    isDeleted: Boolean(knowledge.isDeleted),
    confidence:
      knowledge.confidence === null ? null : Number(knowledge.confidence),
    version: Number(knowledge.version),
  }
}

// ============ 查询 ============

/// 查询项目的知识列表（未软删除）
/// 可按状态筛选；默认按更新时间倒序
export async function listKnowledge(
  projectId: EntityId,
  status?: KnowledgeStatus,
): Promise<Knowledge[]> {
  if (status) {
    const rows = await select<Record<string, unknown>>(
      'SELECT * FROM knowledge WHERE project_id = ? AND status = ? AND is_deleted = 0 ORDER BY updated_at DESC',
      [projectId, status],
    )
    return rows.map(mapKnowledge)
  }

  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM knowledge WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [projectId],
  )
  return rows.map(mapKnowledge)
}

/// 统计项目下未删除的知识数量
export async function countKnowledgeByProject(projectId: EntityId): Promise<number> {
  const rows = await select<{ count: number }>(
    'SELECT COUNT(*) AS count FROM knowledge WHERE project_id = ? AND is_deleted = 0',
    [projectId],
  )
  return rows[0]?.count ?? 0
}

/// 根据 ID 查询知识
export async function findKnowledgeById(id: EntityId): Promise<Knowledge | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM knowledge WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapKnowledge(rows[0]!)
}

// ============ 写入 ============

/// 创建知识
export async function insertKnowledge(input: {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  content: string
  summary: string | null
  sourceType: string | null
  sourceId: EntityId | null
  aiUsageAllowed: boolean
  confidence: number | null
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO knowledge (
      id, project_id, title, type, content, summary, status,
      source_type, source_id, ai_usage_allowed, confidence,
      version, replaced_by_id, is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 1, NULL, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.type,
      input.content,
      input.summary,
      input.sourceType,
      input.sourceId,
      input.aiUsageAllowed ? 1 : 0,
      input.confidence,
      timestamp,
      timestamp,
    ],
  )
}

/// 创建知识（指定版本号，用于版本演进）
/// 与 insertKnowledge 的区别：version 由调用方指定，而非硬编码为 1
export async function insertKnowledgeVersion(input: {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  content: string
  summary: string | null
  sourceType: string | null
  sourceId: EntityId | null
  aiUsageAllowed: boolean
  confidence: number | null
  version: number
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO knowledge (
      id, project_id, title, type, content, summary, status,
      source_type, source_id, ai_usage_allowed, confidence,
      version, replaced_by_id, is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.type,
      input.content,
      input.summary,
      input.sourceType,
      input.sourceId,
      input.aiUsageAllowed ? 1 : 0,
      input.confidence,
      input.version,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新知识内容
export async function updateKnowledgeContent(
  id: EntityId,
  patch: Partial<{
    title: string
    type: string
    content: string
    summary: string
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  const fieldMap: Record<string, string> = {
    title: 'title',
    type: 'type',
    content: 'content',
    summary: 'summary',
  }

  for (const [tsKey, dbKey] of Object.entries(fieldMap)) {
    if (tsKey in patch) {
      fields.push(`${dbKey} = ?`)
      params.push((patch as Record<string, unknown>)[tsKey])
    }
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(
    `UPDATE knowledge SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 更新知识状态
export async function updateKnowledgeStatus(
  id: EntityId,
  status: KnowledgeStatus,
): Promise<void> {
  await execute(
    'UPDATE knowledge SET status = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [status, now(), id],
  )
}

/// 更新知识 AI 使用权限
export async function updateKnowledgeAiUsage(
  id: EntityId,
  allowed: boolean,
): Promise<void> {
  await execute(
    'UPDATE knowledge SET ai_usage_allowed = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [allowed ? 1 : 0, now(), id],
  )
}

/// 更新知识置信度
export async function updateKnowledgeConfidence(
  id: EntityId,
  confidence: number | null,
): Promise<void> {
  await execute(
    'UPDATE knowledge SET confidence = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [confidence, now(), id],
  )
}

/// 标记知识被替换（版本演进）
export async function markReplacedBy(
  oldId: EntityId,
  newId: EntityId,
): Promise<void> {
  await execute(
    'UPDATE knowledge SET status = \'deprecated\', replaced_by_id = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [newId, now(), oldId],
  )
}

/// 反查：被指定新版本替换的旧版本（即 replaced_by_id = newId 的记录）
/// 用于版本链路上溯
export async function findKnowledgeByReplacedById(
  newId: EntityId,
): Promise<Knowledge | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM knowledge WHERE replaced_by_id = ? AND is_deleted = 0',
    [newId],
  )
  if (rows.length === 0) return null
  return mapKnowledge(rows[0]!)
}

/// 软删除知识
export async function softDeleteKnowledge(id: EntityId): Promise<void> {
  await execute(
    'UPDATE knowledge SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
