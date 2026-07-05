// 公式 Repository
// 对应表：equations
// 负责所有块级公式相关的数据库访问

import type { Equation, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now, generateId } from './mapping'

// ============ 行映射 ============

const EQUATION_FIELD_MAP: Record<keyof Equation, string> = {
  id: 'id',
  projectId: 'project_id',
  documentId: 'document_id',
  number: 'number',
  label: 'label',
  latex: 'latex',
  prosemirrorPos: 'prosemirror_pos',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapEquation(row: Record<string, unknown>): Equation {
  const eq = mapRow<Equation>(row, EQUATION_FIELD_MAP)
  return {
    ...eq,
    isDeleted: Boolean(eq.isDeleted),
  }
}

// ============ 查询 ============

/// 查询文档内的公式列表（未软删除，按编号排序）
export async function listEquationsByDocument(documentId: EntityId): Promise<Equation[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM equations WHERE document_id = ? AND is_deleted = 0 ORDER BY number ASC',
    [documentId],
  )
  return rows.map(mapEquation)
}

/// 根据 ID 查询公式
export async function findEquationById(id: EntityId): Promise<Equation | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM equations WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapEquation(rows[0]!)
}

/// 查询文档内最大编号（用于自动编号）
export async function getMaxEquationNumber(documentId: EntityId): Promise<number> {
  const rows = await select<{ max_num: number | null }>(
    'SELECT MAX(number) AS max_num FROM equations WHERE document_id = ? AND is_deleted = 0',
    [documentId],
  )
  return rows[0]?.max_num ?? 0
}

/// 根据 label 查询公式（用于交叉引用解析 + 唯一性校验）
export async function findEquationByLabel(
  documentId: EntityId,
  label: string,
): Promise<Equation | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM equations WHERE document_id = ? AND label = ? AND is_deleted = 0',
    [documentId, label],
  )
  if (rows.length === 0) return null
  return mapEquation(rows[0]!)
}

// ============ 写入 ============

/// 创建公式
export async function insertEquation(input: {
  id?: EntityId
  projectId: EntityId
  documentId: EntityId
  number: number
  label: string | null
  latex: string
  prosemirrorPos: number | null
}): Promise<Equation> {
  const id = input.id ?? generateId()
  const timestamp = now()

  await execute(
    `INSERT INTO equations (
      id, project_id, document_id, number, label, latex, prosemirror_pos,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      input.projectId,
      input.documentId,
      input.number,
      input.label,
      input.latex,
      input.prosemirrorPos,
      timestamp,
      timestamp,
    ],
  )

  const created = await findEquationById(id)
  if (!created) {
    throw new Error('公式写入后查询失败')
  }
  return created
}

/// 更新公式
export async function updateEquation(
  id: EntityId,
  patch: Partial<{
    number: number
    label: string | null
    latex: string
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
  if (patch.latex !== undefined) {
    fields.push('latex = ?')
    params.push(patch.latex)
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
    `UPDATE equations SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 软删除公式
export async function softDeleteEquation(id: EntityId): Promise<void> {
  await execute(
    'UPDATE equations SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}
