// 文档 Repository
// 对应表：documents
// 负责所有 documents 表的数据库访问

import type { Document, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now, parseJsonField, stringifyJsonField } from './mapping'

// ============ 行映射 ============

const DOCUMENT_FIELD_MAP: Record<keyof Document, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  type: 'type',
  contentJson: 'content_json',
  plainText: 'plain_text',
  wordCount: 'word_count',
  outlineNodeId: 'outline_node_id',
  status: 'status',
  summary: 'summary',
  lastEditedAt: 'last_edited_at',
  citationStyle: 'citation_style',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapDocument(row: Record<string, unknown>): Document {
  const doc = mapRow<Document>(row, DOCUMENT_FIELD_MAP)
  return {
    ...doc,
    contentJson: parseJsonField(doc.contentJson, null),
    isDeleted: Boolean(doc.isDeleted),
  }
}

// ============ 查询 ============

/// 查询项目的文档列表（未软删除）
export async function listDocuments(projectId: EntityId): Promise<Document[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM documents WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [projectId],
  )
  return rows.map(mapDocument)
}

/// 根据 ID 查询文档
export async function findDocumentById(id: EntityId): Promise<Document | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM documents WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapDocument(rows[0]!)
}

// ============ 写入 ============

/// 创建文档
export async function insertDocument(input: {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  outlineNodeId: EntityId | null
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO documents (
      id, project_id, title, type, content_json, plain_text, word_count,
      outline_node_id, status, summary, last_edited_at,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, '', 0, ?, 'draft', NULL, ?, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.type,
      input.outlineNodeId,
      timestamp,
      timestamp,
      timestamp,
    ],
  )
}

/// 自动保存文档内容
export async function updateDocumentContent(input: {
  documentId: EntityId
  contentJson: unknown
  plainText: string
  wordCount: number
}): Promise<void> {
  const timestamp = now()
  await execute(
    `UPDATE documents SET
      content_json = ?, plain_text = ?, word_count = ?,
      last_edited_at = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0`,
    [
      stringifyJsonField(input.contentJson),
      input.plainText,
      input.wordCount,
      timestamp,
      timestamp,
      input.documentId,
    ],
  )
}

/// 更新文档标题
export async function updateDocumentTitle(
  id: EntityId,
  title: string,
): Promise<void> {
  await execute(
    'UPDATE documents SET title = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [title, now(), id],
  )
}

/// 更新文档状态
export async function updateDocumentStatus(
  id: EntityId,
  status: Document['status'],
): Promise<void> {
  await execute(
    'UPDATE documents SET status = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [status, now(), id],
  )
}

/// 软删除文档
export async function softDeleteDocument(id: EntityId): Promise<void> {
  await execute(
    'UPDATE documents SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
