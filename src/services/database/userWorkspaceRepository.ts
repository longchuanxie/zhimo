// 用户与工作空间 Repository
// 对应表：users, workspaces
// 对应任务：DEV-010

import type { User, Workspace } from '@/types'
import { select } from './db'
import { mapRow } from './mapping'

// ============ 行映射 ============

const USER_FIELD_MAP: Record<keyof User, string> = {
  id: 'id',
  displayName: 'display_name',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

const WORKSPACE_FIELD_MAP: Record<keyof Workspace, string> = {
  id: 'id',
  name: 'name',
  createdBy: 'created_by',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

// ============ 查询 ============

/// 根据 ID 查询用户
export async function findUserById(id: string): Promise<User | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM users WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapRow<User>(rows[0]!, USER_FIELD_MAP)
}

/// 查询默认用户
export async function findDefaultUser(): Promise<User | null> {
  return findUserById('default_user')
}

/// 根据 ID 查询工作空间
export async function findWorkspaceById(id: string): Promise<Workspace | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM workspaces WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapRow<Workspace>(rows[0]!, WORKSPACE_FIELD_MAP)
}

/// 查询默认工作空间
export async function findDefaultWorkspace(): Promise<Workspace | null> {
  return findWorkspaceById('default_workspace')
}
