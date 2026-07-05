// 引文实例 Repository
// 对应表：citations
// 负责所有引文实例相关的数据库访问

import type { Citation, CitationFormat, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now, generateId } from './mapping'

// ============ 行映射 ============

const CITATION_FIELD_MAP: Record<keyof Citation, string> = {
  id: 'id',
  projectId: 'project_id',
  documentId: 'document_id',
  referenceId: 'reference_id',
  citationFormat: 'citation_format',
  locator: 'locator',
  prefix: 'prefix',
  suffix: 'suffix',
  inlineText: 'inline_text',
  prosemirrorPos: 'prosemirror_pos',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapCitation(row: Record<string, unknown>): Citation {
  const citation = mapRow<Citation>(row, CITATION_FIELD_MAP)
  return {
    ...citation,
    isDeleted: Boolean(citation.isDeleted),
  }
}

// ============ 查询 ============

/// 查询文档内的引文列表（未软删除，按创建时间排序）
export async function listCitationsByDocument(documentId: EntityId): Promise<Citation[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM citations WHERE document_id = ? AND is_deleted = 0 ORDER BY created_at ASC',
    [documentId],
  )
  return rows.map(mapCitation)
}

/// 根据 ID 查询引文
export async function findCitationById(id: EntityId): Promise<Citation | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM citations WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapCitation(rows[0]!)
}

/// 查询关联到指定参考文献的所有引文（用于删除 reference 前检查）
export async function listCitationsByReference(referenceId: EntityId): Promise<Citation[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM citations WHERE reference_id = ? AND is_deleted = 0',
    [referenceId],
  )
  return rows.map(mapCitation)
}

// ============ 写入 ============

/// 创建引文
export async function insertCitation(input: {
  id?: EntityId
  projectId: EntityId
  documentId: EntityId
  referenceId: EntityId
  citationFormat: CitationFormat
  locator: string | null
  prefix: string | null
  suffix: string | null
  inlineText: string
  prosemirrorPos: number | null
}): Promise<Citation> {
  const id = input.id ?? generateId()
  const timestamp = now()

  await execute(
    `INSERT INTO citations (
      id, project_id, document_id, reference_id, citation_format,
      locator, prefix, suffix, inline_text, prosemirror_pos,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      input.projectId,
      input.documentId,
      input.referenceId,
      input.citationFormat,
      input.locator,
      input.prefix,
      input.suffix,
      input.inlineText,
      input.prosemirrorPos,
      timestamp,
      timestamp,
    ],
  )

  const created = await findCitationById(id)
  if (!created) {
    throw new Error('引文写入后查询失败')
  }
  return created
}

/// 更新引文
export async function updateCitation(
  id: EntityId,
  patch: Partial<{
    citationFormat: CitationFormat
    locator: string | null
    prefix: string | null
    suffix: string | null
    inlineText: string
    prosemirrorPos: number | null
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.citationFormat !== undefined) {
    fields.push('citation_format = ?')
    params.push(patch.citationFormat)
  }
  if (patch.locator !== undefined) {
    fields.push('locator = ?')
    params.push(patch.locator)
  }
  if (patch.prefix !== undefined) {
    fields.push('prefix = ?')
    params.push(patch.prefix)
  }
  if (patch.suffix !== undefined) {
    fields.push('suffix = ?')
    params.push(patch.suffix)
  }
  if (patch.inlineText !== undefined) {
    fields.push('inline_text = ?')
    params.push(patch.inlineText)
  }
  if (patch.prosemirrorPos !== undefined) {
    fields.push('prosemirror_pos = ?')
    params.push(patch.prosemirrorPos)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(
    `UPDATE citations SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 软删除引文
export async function softDeleteCitation(id: EntityId): Promise<void> {
  await execute(
    'UPDATE citations SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
