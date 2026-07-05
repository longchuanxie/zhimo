// 图表 Repository
// 对应表：figures
// 负责所有图表（figure/table）相关的数据库访问

import type { Figure, FigureKind, EntityId } from '@/types'
import { select, execute } from './db'
import {
  mapRow,
  now,
  generateId,
  parseJsonField,
  stringifyJsonField,
} from './mapping'

// ============ 行映射 ============

const FIGURE_FIELD_MAP: Record<keyof Figure, string> = {
  id: 'id',
  projectId: 'project_id',
  documentId: 'document_id',
  kind: 'kind',
  number: 'number',
  label: 'label',
  caption: 'caption',
  note: 'note',
  sourceId: 'source_id',
  imagePath: 'image_path',
  imageData: 'image_data',
  tableData: 'table_data',
  prosemirrorPos: 'prosemirror_pos',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapFigure(row: Record<string, unknown>): Figure {
  const fig = mapRow<Figure>(row, FIGURE_FIELD_MAP)
  return {
    ...fig,
    tableData: parseJsonField<unknown>(fig.tableData, null),
    isDeleted: Boolean(fig.isDeleted),
  }
}

// ============ 查询 ============

/// 查询文档内的图表列表（未软删除，按编号排序）
export async function listFiguresByDocument(
  documentId: EntityId,
  kind?: FigureKind,
): Promise<Figure[]> {
  if (kind) {
    const rows = await select<Record<string, unknown>>(
      'SELECT * FROM figures WHERE document_id = ? AND kind = ? AND is_deleted = 0 ORDER BY number ASC',
      [documentId, kind],
    )
    return rows.map(mapFigure)
  }

  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM figures WHERE document_id = ? AND is_deleted = 0 ORDER BY kind ASC, number ASC',
    [documentId],
  )
  return rows.map(mapFigure)
}

/// 查询项目内的图表列表（按 kind 过滤）
export async function listFiguresByProject(
  projectId: EntityId,
  kind?: FigureKind,
): Promise<Figure[]> {
  if (kind) {
    const rows = await select<Record<string, unknown>>(
      'SELECT * FROM figures WHERE project_id = ? AND kind = ? AND is_deleted = 0 ORDER BY number ASC',
      [projectId, kind],
    )
    return rows.map(mapFigure)
  }

  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM figures WHERE project_id = ? AND is_deleted = 0 ORDER BY kind ASC, number ASC',
    [projectId],
  )
  return rows.map(mapFigure)
}

/// 根据 ID 查询图表
export async function findFigureById(id: EntityId): Promise<Figure | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM figures WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapFigure(rows[0]!)
}

/// 查询文档内指定 kind 的最大编号（用于自动编号）
export async function getMaxFigureNumber(
  documentId: EntityId,
  kind: FigureKind,
): Promise<number> {
  const rows = await select<{ max_num: number | null }>(
    'SELECT MAX(number) AS max_num FROM figures WHERE document_id = ? AND kind = ? AND is_deleted = 0',
    [documentId, kind],
  )
  return rows[0]?.max_num ?? 0
}

/// 根据 label 查询图表（用于交叉引用解析）
export async function findFigureByLabel(
  documentId: EntityId,
  label: string,
): Promise<Figure | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM figures WHERE document_id = ? AND label = ? AND is_deleted = 0',
    [documentId, label],
  )
  if (rows.length === 0) return null
  return mapFigure(rows[0]!)
}

// ============ 写入 ============

/// 创建图表
export async function insertFigure(input: {
  id?: EntityId
  projectId: EntityId
  documentId: EntityId
  kind: FigureKind
  number: number
  label: string | null
  caption: string
  note: string | null
  sourceId: EntityId | null
  imagePath: string | null
  imageData: string | null
  tableData: unknown | null
  prosemirrorPos: number | null
}): Promise<Figure> {
  const id = input.id ?? generateId()
  const timestamp = now()

  await execute(
    `INSERT INTO figures (
      id, project_id, document_id, kind, number, label, caption, note,
      source_id, image_path, image_data, table_data, prosemirror_pos,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      input.projectId,
      input.documentId,
      input.kind,
      input.number,
      input.label,
      input.caption,
      input.note,
      input.sourceId,
      input.imagePath,
      input.imageData,
      input.tableData ? stringifyJsonField(input.tableData) : null,
      input.prosemirrorPos,
      timestamp,
      timestamp,
    ],
  )

  const created = await findFigureById(id)
  if (!created) {
    throw new Error('图表写入后查询失败')
  }
  return created
}

/// 更新图表
export async function updateFigure(
  id: EntityId,
  patch: Partial<{
    number: number
    label: string | null
    caption: string
    note: string | null
    sourceId: EntityId | null
    imagePath: string | null
    imageData: string | null
    tableData: unknown | null
    prosemirrorPos: number | null
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.number !== undefined) {
    fields.push('number = ?')
    params.push(patch.number)
  }
  if (patch.label !== undefined) {
    fields.push('label = ?')
    params.push(patch.label)
  }
  if (patch.caption !== undefined) {
    fields.push('caption = ?')
    params.push(patch.caption)
  }
  if (patch.note !== undefined) {
    fields.push('note = ?')
    params.push(patch.note)
  }
  if (patch.sourceId !== undefined) {
    fields.push('source_id = ?')
    params.push(patch.sourceId)
  }
  if (patch.imagePath !== undefined) {
    fields.push('image_path = ?')
    params.push(patch.imagePath)
  }
  if (patch.imageData !== undefined) {
    fields.push('image_data = ?')
    params.push(patch.imageData)
  }
  if (patch.tableData !== undefined) {
    fields.push('table_data = ?')
    params.push(patch.tableData ? stringifyJsonField(patch.tableData) : null)
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
    `UPDATE figures SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 软删除图表
export async function softDeleteFigure(id: EntityId): Promise<void> {
  await execute(
    'UPDATE figures SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
