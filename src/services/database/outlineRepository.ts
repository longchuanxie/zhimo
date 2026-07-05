// 大纲 Repository
// 对应表：outlines, outline_nodes
// 创建项目时需要同步创建默认大纲

import type { Outline, OutlineNode, OutlineNodeStatus, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now } from './mapping'

// ============ 行映射 ============

const OUTLINE_FIELD_MAP: Record<keyof Outline, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

const OUTLINE_NODE_FIELD_MAP: Record<keyof OutlineNode, string> = {
  id: 'id',
  projectId: 'project_id',
  outlineId: 'outline_id',
  parentId: 'parent_id',
  title: 'title',
  description: 'description',
  status: 'status',
  sortOrder: 'sort_order',
  depth: 'depth',
  linkedDocumentId: 'linked_document_id',
  targetWordCount: 'target_word_count',
  currentWordCount: 'current_word_count',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapOutline(row: Record<string, unknown>): Outline {
  return mapRow<Outline>(row, OUTLINE_FIELD_MAP)
}

function mapOutlineNode(row: Record<string, unknown>): OutlineNode {
  const node = mapRow<OutlineNode>(row, OUTLINE_NODE_FIELD_MAP)
  return {
    ...node,
    isDeleted: Boolean(node.isDeleted),
  }
}

// ============ Outline ============

/// 查询项目的默认大纲
export async function findOutlineByProjectId(projectId: EntityId): Promise<Outline | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM outlines WHERE project_id = ?',
    [projectId],
  )
  if (rows.length === 0) return null
  return mapOutline(rows[0]!)
}

/// 创建默认大纲
export async function insertOutline(input: {
  id: EntityId
  projectId: EntityId
  title: string
}): Promise<void> {
  const timestamp = now()
  await execute(
    'INSERT INTO outlines (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [input.id, input.projectId, input.title, timestamp, timestamp],
  )
}

// ============ OutlineNode ============

/// 查询大纲的所有节点（未软删除）
export async function listOutlineNodes(outlineId: EntityId): Promise<OutlineNode[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM outline_nodes WHERE outline_id = ? AND is_deleted = 0 ORDER BY sort_order ASC',
    [outlineId],
  )
  return rows.map(mapOutlineNode)
}

/// 创建大纲节点
export async function insertOutlineNode(input: {
  id: EntityId
  projectId: EntityId
  outlineId: EntityId
  parentId: EntityId | null
  title: string
  description: string | null
  sortOrder: number
  depth: number
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO outline_nodes (
      id, project_id, outline_id, parent_id, title, description,
      status, sort_order, depth, linked_document_id,
      target_word_count, current_word_count,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, 0, 0, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.outlineId,
      input.parentId,
      input.title,
      input.description,
      input.sortOrder,
      input.depth,
      timestamp,
      timestamp,
    ],
  )
}

/// 根据 ID 查询大纲节点
export async function findOutlineNodeById(id: EntityId): Promise<OutlineNode | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM outline_nodes WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapOutlineNode(rows[0]!)
}

/// 查询项目的所有大纲节点（通过 project_id）
export async function listOutlineNodesByProject(projectId: EntityId): Promise<OutlineNode[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM outline_nodes WHERE project_id = ? AND is_deleted = 0 ORDER BY sort_order ASC',
    [projectId],
  )
  return rows.map(mapOutlineNode)
}

/// 更新大纲节点
export async function updateOutlineNode(
  id: EntityId,
  patch: Partial<{
    title: string
    description: string
    status: OutlineNodeStatus
    targetWordCount: number
    currentWordCount: number
    linkedDocumentId: EntityId | null
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    status: 'status',
    targetWordCount: 'target_word_count',
    currentWordCount: 'current_word_count',
    linkedDocumentId: 'linked_document_id',
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
    `UPDATE outline_nodes SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 更新大纲节点排序
export async function updateOutlineNodeSort(
  id: EntityId,
  sortOrder: number,
  parentId: EntityId | null,
  depth: number,
): Promise<void> {
  await execute(
    'UPDATE outline_nodes SET sort_order = ?, parent_id = ?, depth = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [sortOrder, parentId, depth, now(), id],
  )
}

/// 软删除大纲节点
export async function softDeleteOutlineNode(id: EntityId): Promise<void> {
  await execute(
    'UPDATE outline_nodes SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}

/// 查询大纲节点最大排序值
export async function getMaxSortOrder(outlineId: EntityId, parentId: EntityId | null): Promise<number> {
  const rows = await select<{ max_sort: number | null }>(
    'SELECT MAX(sort_order) as max_sort FROM outline_nodes WHERE outline_id = ? AND parent_id IS ? AND is_deleted = 0',
    [outlineId, parentId],
  )
  return rows[0]?.max_sort ?? -1
}
