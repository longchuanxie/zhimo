// 项目 Repository
// 对应表：projects
// 负责所有 projects 表的数据库访问

import type { Project, ProjectType, ProjectStatus, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now } from './mapping'

// ============ 行映射 ============

const PROJECT_FIELD_MAP: Record<keyof Project, string> = {
  id: 'id',
  workspaceId: 'workspace_id',
  name: 'name',
  type: 'type',
  description: 'description',
  writingGoal: 'writing_goal',
  targetReader: 'target_reader',
  targetWordCount: 'target_word_count',
  currentWordCount: 'current_word_count',
  language: 'language',
  styleRules: 'style_rules',
  forbiddenRules: 'forbidden_rules',
  status: 'status',
  createdBy: 'created_by',
  updatedBy: 'updated_by',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

/// 将数据库行映射为 Project 实体
function mapProject(row: Record<string, unknown>): Project {
  const project = mapRow<Project>(row, PROJECT_FIELD_MAP)
  return {
    ...project,
    isDeleted: Boolean(project.isDeleted),
  }
}

// ============ 查询 ============

/// 查询项目列表（未软删除）
export async function listProjects(input?: {
  workspaceId?: EntityId
  keyword?: string
  type?: ProjectType
  status?: ProjectStatus
}): Promise<Project[]> {
  const conditions = ['is_deleted = 0']
  const params: unknown[] = []

  if (input?.workspaceId) {
    conditions.push('workspace_id = ?')
    params.push(input.workspaceId)
  }

  if (input?.keyword) {
    conditions.push('(name LIKE ? OR description LIKE ?)')
    params.push(`%${input.keyword}%`, `%${input.keyword}%`)
  }

  if (input?.type) {
    conditions.push('type = ?')
    params.push(input.type)
  }

  if (input?.status) {
    conditions.push('status = ?')
    params.push(input.status)
  }

  const sql = `SELECT * FROM projects WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`
  const rows = await select<Record<string, unknown>>(sql, params)
  return rows.map(mapProject)
}

/// 根据 ID 查询项目
export async function findProjectById(id: EntityId): Promise<Project | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM projects WHERE id = ? AND is_deleted = 0',
    [id],
  )
  if (rows.length === 0) return null
  return mapProject(rows[0]!)
}

// ============ 写入 ============

/// 创建项目
export async function insertProject(input: {
  id: EntityId
  workspaceId: EntityId
  name: string
  type: ProjectType
  description: string | null
  writingGoal: string | null
  targetReader: string | null
  targetWordCount: number
  language: string
  styleRules: string | null
  forbiddenRules: string | null
  status: ProjectStatus
  createdBy: EntityId
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO projects (
      id, workspace_id, name, type, description, writing_goal, target_reader,
      target_word_count, current_word_count, language, style_rules, forbidden_rules,
      status, created_by, updated_by, is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
    [
      input.id,
      input.workspaceId,
      input.name,
      input.type,
      input.description,
      input.writingGoal,
      input.targetReader,
      input.targetWordCount,
      input.language,
      input.styleRules,
      input.forbiddenRules,
      input.status,
      input.createdBy,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新项目
export async function updateProject(
  id: EntityId,
  patch: Partial<Pick<Project, 'name' | 'description' | 'writingGoal' | 'targetReader' | 'targetWordCount' | 'language' | 'styleRules' | 'forbiddenRules' | 'status' | 'currentWordCount'>>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    writingGoal: 'writing_goal',
    targetReader: 'target_reader',
    targetWordCount: 'target_word_count',
    currentWordCount: 'current_word_count',
    language: 'language',
    styleRules: 'style_rules',
    forbiddenRules: 'forbidden_rules',
    status: 'status',
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
    `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`,
    params,
  )
}

/// 软删除项目
export async function softDeleteProject(id: EntityId): Promise<void> {
  await execute(
    'UPDATE projects SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now(), now(), id],
  )
}

/// 更新项目字数统计
export async function updateProjectWordCount(
  id: EntityId,
  wordCount: number,
): Promise<void> {
  await execute(
    'UPDATE projects SET current_word_count = ?, updated_at = ? WHERE id = ?',
    [wordCount, now(), id],
  )
}
