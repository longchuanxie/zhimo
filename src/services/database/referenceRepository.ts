// 参考文献库 Repository
// 对应表：bibliographic_references
// 负责所有参考文献相关的数据库访问
// 注:表名使用 bibliographic_references 而非 references,避免与 SQL 保留字冲突

import type { Reference, ReferenceEntryType, AuthorInfo, BibliographicMetadata, EntityId } from '@/types'
import { select, execute } from './db'
import {
  mapRow,
  now,
  generateId,
  parseJsonField,
  stringifyJsonField,
} from './mapping'

// ============ 行映射 ============

const REFERENCE_FIELD_MAP: Record<keyof Reference, string> = {
  id: 'id',
  projectId: 'project_id',
  sourceId: 'source_id',
  citationKey: 'citation_key',
  entryType: 'entry_type',
  title: 'title',
  authors: 'authors_json',
  year: 'year',
  container: 'container',
  volume: 'volume',
  issue: 'issue',
  pages: 'pages',
  publisher: 'publisher',
  city: 'city',
  doi: 'doi',
  isbn: 'isbn',
  url: 'url',
  accessDate: 'access_date',
  rawMetadata: 'raw_metadata',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapReference(row: Record<string, unknown>): Reference {
  const ref = mapRow<Reference>(row, REFERENCE_FIELD_MAP)
  return {
    ...ref,
    authors: parseJsonField<AuthorInfo[]>(ref.authors, []),
    rawMetadata: parseJsonField<BibliographicMetadata | null>(ref.rawMetadata, null),
    isDeleted: Boolean(ref.isDeleted),
  }
}

// ============ 查询 ============

/// 查询项目的参考文献列表（未软删除）
export async function listReferencesByProject(projectId: EntityId): Promise<Reference[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM bibliographic_references WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [projectId],
  )
  return rows.map(mapReference)
}

/// 根据 ID 查询参考文献
export async function findReferenceById(id: EntityId): Promise<Reference | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM bibliographic_references WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapReference(rows[0]!)
}

/// 根据 citationKey 查询（项目内唯一性校验）
export async function findReferenceByCitationKey(
  projectId: EntityId,
  citationKey: string,
): Promise<Reference | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM bibliographic_references WHERE project_id = ? AND citation_key = ? AND is_deleted = 0',
    [projectId, citationKey],
  )
  if (rows.length === 0) return null
  return mapReference(rows[0]!)
}

/// 查询关联到指定资料的参考文献（用于 importFromSource 去重）
export async function findReferencesBySource(sourceId: EntityId): Promise<Reference[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM bibliographic_references WHERE source_id = ? AND is_deleted = 0',
    [sourceId],
  )
  return rows.map(mapReference)
}

/// 搜索参考文献（按标题/作者/citationKey 模糊匹配）
export async function searchReferences(
  projectId: EntityId,
  query: string,
): Promise<Reference[]> {
  const pattern = `%${query}%`
  const rows = await select<Record<string, unknown>>(
    `SELECT * FROM bibliographic_references
     WHERE project_id = ? AND is_deleted = 0
     AND (title LIKE ? OR citation_key LIKE ? OR authors_json LIKE ?)
     ORDER BY updated_at DESC`,
    [projectId, pattern, pattern, pattern],
  )
  return rows.map(mapReference)
}

// ============ 写入 ============

/// 创建参考文献
export async function insertReference(input: {
  id?: EntityId
  projectId: EntityId
  sourceId: EntityId | null
  citationKey: string
  entryType: ReferenceEntryType
  title: string
  authors: AuthorInfo[]
  year: number | null
  container: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  city: string | null
  doi: string | null
  isbn: string | null
  url: string | null
  accessDate: string | null
  rawMetadata: BibliographicMetadata | null
}): Promise<Reference> {
  const id = input.id ?? generateId()
  const timestamp = now()

  await execute(
    `INSERT INTO bibliographic_references (
      id, project_id, source_id, citation_key, entry_type, title, authors_json,
      year, container, volume, issue, pages, publisher, city,
      doi, isbn, url, access_date, raw_metadata,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      input.projectId,
      input.sourceId,
      input.citationKey,
      input.entryType,
      input.title,
      stringifyJsonField(input.authors),
      input.year,
      input.container,
      input.volume,
      input.issue,
      input.pages,
      input.publisher,
      input.city,
      input.doi,
      input.isbn,
      input.url,
      input.accessDate,
      input.rawMetadata ? stringifyJsonField(input.rawMetadata) : null,
      timestamp,
      timestamp,
    ],
  )

  const created = await findReferenceById(id)
  if (!created) {
    throw new Error('参考文献写入后查询失败')
  }
  return created
}

/// 更新参考文献
export async function updateReference(
  id: EntityId,
  patch: Partial<{
    sourceId: EntityId | null
    citationKey: string
    entryType: ReferenceEntryType
    title: string
    authors: AuthorInfo[]
    year: number | null
    container: string | null
    volume: string | null
    issue: string | null
    pages: string | null
    publisher: string | null
    city: string | null
    doi: string | null
    isbn: string | null
    url: string | null
    accessDate: string | null
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.sourceId !== undefined) {
    fields.push('source_id = ?')
    params.push(patch.sourceId)
  }
  if (patch.citationKey !== undefined) {
    fields.push('citation_key = ?')
    params.push(patch.citationKey)
  }
  if (patch.entryType !== undefined) {
    fields.push('entry_type = ?')
    params.push(patch.entryType)
  }
  if (patch.title !== undefined) {
    fields.push('title = ?')
    params.push(patch.title)
  }
  if (patch.authors !== undefined) {
    fields.push('authors_json = ?')
    params.push(stringifyJsonField(patch.authors))
  }
  if (patch.year !== undefined) {
    fields.push('year = ?')
    params.push(patch.year)
  }
  if (patch.container !== undefined) {
    fields.push('container = ?')
    params.push(patch.container)
  }
  if (patch.volume !== undefined) {
    fields.push('volume = ?')
    params.push(patch.volume)
  }
  if (patch.issue !== undefined) {
    fields.push('issue = ?')
    params.push(patch.issue)
  }
  if (patch.pages !== undefined) {
    fields.push('pages = ?')
    params.push(patch.pages)
  }
  if (patch.publisher !== undefined) {
    fields.push('publisher = ?')
    params.push(patch.publisher)
  }
  if (patch.city !== undefined) {
    fields.push('city = ?')
    params.push(patch.city)
  }
  if (patch.doi !== undefined) {
    fields.push('doi = ?')
    params.push(patch.doi)
  }
  if (patch.isbn !== undefined) {
    fields.push('isbn = ?')
    params.push(patch.isbn)
  }
  if (patch.url !== undefined) {
    fields.push('url = ?')
    params.push(patch.url)
  }
  if (patch.accessDate !== undefined) {
    fields.push('access_date = ?')
    params.push(patch.accessDate)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(
    `UPDATE bibliographic_references SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 软删除参考文献
export async function softDeleteReference(id: EntityId): Promise<void> {
  await execute(
    'UPDATE bibliographic_references SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
