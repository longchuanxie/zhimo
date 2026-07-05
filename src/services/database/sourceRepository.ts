// 资料 Repository
// 对应表：sources, source_chunks
// 负责所有资料相关的数据库访问

import type { Source, SourceChunk, EntityId, BibliographicMetadata } from '@/types'
import { select, execute } from './db'
import {
  mapRow,
  now,
  parseStringArray,
  stringifyStringArray,
  parseJsonField,
} from './mapping'

// ============ 行映射 ============

const SOURCE_FIELD_MAP: Record<keyof Source, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  type: 'type',
  fileUrl: 'file_url',
  fileName: 'file_name',
  fileSize: 'file_size',
  mimeType: 'mime_type',
  rawText: 'raw_text',
  summaryShort: 'summary_short',
  summaryLong: 'summary_long',
  keywords: 'keywords',
  aiUsageAllowed: 'ai_usage_allowed',
  privacyLevel: 'privacy_level',
  processingStatus: 'processing_status',
  sourceStatus: 'source_status',
  errorMessage: 'error_message',
  bibliographicMetadata: 'bibliographic_metadata',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapSource(row: Record<string, unknown>): Source {
  const src = mapRow<Source>(row, SOURCE_FIELD_MAP)
  return {
    ...src,
    keywords: parseStringArray(src.keywords),
    aiUsageAllowed: Boolean(src.aiUsageAllowed),
    isDeleted: Boolean(src.isDeleted),
    bibliographicMetadata: parseJsonField<BibliographicMetadata | null>(src.bibliographicMetadata, null),
  }
}

const SOURCE_CHUNK_FIELD_MAP: Record<keyof SourceChunk, string> = {
  id: 'id',
  projectId: 'project_id',
  sourceId: 'source_id',
  chunkIndex: 'chunk_index',
  content: 'content',
  tokenCount: 'token_count',
  pageNumber: 'page_number',
  startOffset: 'start_offset',
  endOffset: 'end_offset',
  embeddingId: 'embedding_id',
  createdAt: 'created_at',
}

function mapSourceChunk(row: Record<string, unknown>): SourceChunk {
  return mapRow<SourceChunk>(row, SOURCE_CHUNK_FIELD_MAP)
}

// ============ Source 查询 ============

/// 查询项目的资料列表（未软删除）
export async function listSources(projectId: EntityId): Promise<Source[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM sources WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [projectId],
  )
  return rows.map(mapSource)
}

/// 统计项目下未删除的资料数量
export async function countSourcesByProject(projectId: EntityId): Promise<number> {
  const rows = await select<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sources WHERE project_id = ? AND is_deleted = 0',
    [projectId],
  )
  return rows[0]?.count ?? 0
}

/// 根据 ID 查询资料
export async function findSourceById(id: EntityId): Promise<Source | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM sources WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapSource(rows[0]!)
}

// ============ Source 写入 ============

/// 创建资料记录
export async function insertSource(input: {
  id: EntityId
  projectId: EntityId
  title: string
  type: string
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  rawText: string | null
  aiUsageAllowed: boolean
  privacyLevel: string
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO sources (
      id, project_id, title, type, file_url, file_name, file_size, mime_type,
      raw_text, summary_short, summary_long, keywords,
      ai_usage_allowed, privacy_level, processing_status, source_status,
      error_message, is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'pending', 'active', NULL, 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.type,
      input.fileUrl,
      input.fileName,
      input.fileSize,
      input.mimeType,
      input.rawText,
      input.aiUsageAllowed ? 1 : 0,
      input.privacyLevel,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新资料处理状态
export async function updateSourceProcessingStatus(
  id: EntityId,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  await execute(
    'UPDATE sources SET processing_status = ?, error_message = ?, updated_at = ? WHERE id = ?',
    [status, errorMessage, now(), id],
  )
}

/// 更新资料解析结果
export async function updateSourceParsedContent(input: {
  id: EntityId
  rawText: string
  processingStatus: string
}): Promise<void> {
  await execute(
    'UPDATE sources SET raw_text = ?, processing_status = ?, updated_at = ? WHERE id = ?',
    [input.rawText, input.processingStatus, now(), input.id],
  )
}

/// 更新资料摘要
export async function updateSourceSummary(input: {
  id: EntityId
  summaryShort: string | null
  summaryLong: string | null
  keywords: string[] | null
  processingStatus: string
}): Promise<void> {
  await execute(
    `UPDATE sources SET
      summary_short = ?, summary_long = ?, keywords = ?,
      processing_status = ?, updated_at = ?
    WHERE id = ?`,
    [
      input.summaryShort,
      input.summaryLong,
      stringifyStringArray(input.keywords),
      input.processingStatus,
      now(),
      input.id,
    ],
  )
}

/// 更新资料标题
export async function updateSourceTitle(id: EntityId, title: string): Promise<void> {
  await execute(
    'UPDATE sources SET title = ?, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [title, now(), id],
  )
}

/// 更新资料 AI 使用权限
export async function updateSourceAiUsage(
  id: EntityId,
  allowed: boolean,
): Promise<void> {
  await execute(
    'UPDATE sources SET ai_usage_allowed = ?, updated_at = ? WHERE id = ?',
    [allowed ? 1 : 0, now(), id],
  )
}

/// 更新资料状态（active/archived）
export async function updateSourceStatus(
  id: EntityId,
  status: string,
): Promise<void> {
  await execute(
    'UPDATE sources SET source_status = ?, updated_at = ? WHERE id = ?',
    [status, now(), id],
  )
}

/// 软删除资料
export async function softDeleteSource(id: EntityId): Promise<void> {
  await execute(
    'UPDATE sources SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}

// ============ SourceChunk ============

/// 查询资料的所有片段
export async function listSourceChunks(sourceId: EntityId): Promise<SourceChunk[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM source_chunks WHERE source_id = ? ORDER BY chunk_index ASC',
    [sourceId],
  )
  return rows.map(mapSourceChunk)
}

/// 创建资料片段
export async function insertSourceChunk(input: {
  id: EntityId
  projectId: EntityId
  sourceId: EntityId
  chunkIndex: number
  content: string
  tokenCount: number
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
}): Promise<void> {
  await execute(
    `INSERT INTO source_chunks (
      id, project_id, source_id, chunk_index, content, token_count,
      page_number, start_offset, end_offset, embedding_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      input.id,
      input.projectId,
      input.sourceId,
      input.chunkIndex,
      input.content,
      input.tokenCount,
      input.pageNumber,
      input.startOffset,
      input.endOffset,
      now(),
    ],
  )
}

/// 删除资料的所有片段
export async function deleteSourceChunks(sourceId: EntityId): Promise<void> {
  await execute('DELETE FROM source_chunks WHERE source_id = ?', [sourceId])
}
