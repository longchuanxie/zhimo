// Agent Memory Repository
// 对应表：agent_memories
// 负责 Agent 长期记忆的数据库访问

import type { AgentMemory, AgentMemoryKind, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now } from './mapping'

// ============ 行映射 ============

const MEMORY_FIELD_MAP: Record<keyof AgentMemory, string> = {
  id: 'id',
  projectId: 'project_id',
  sourceThreadId: 'source_thread_id',
  kind: 'kind',
  content: 'content',
  confidence: 'confidence',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapMemoryRow(row: Record<string, unknown>): AgentMemory {
  return mapRow<AgentMemory>(row, MEMORY_FIELD_MAP)
}

// ============ 查询 ============

/// 按项目查询记忆列表
///
/// @param projectId 项目 ID
/// @param limit 最大返回数量（默认 50）
export async function listMemoriesByProject(
  projectId: EntityId,
  limit = 50,
): Promise<AgentMemory[]> {
  const rows = await select<Record<string, unknown>>(
    `SELECT * FROM agent_memories
     WHERE project_id = ?
     ORDER BY confidence DESC, updated_at DESC
     LIMIT ?`,
    [projectId, limit],
  )
  return rows.map(mapMemoryRow)
}

/// 按项目查询高置信度记忆（用于上下文召回）
///
/// @param projectId 项目 ID
/// @param minConfidence 最低置信度阈值（默认 0.5）
/// @param limit 最大返回数量
export async function listMemoriesForRecall(
  projectId: EntityId,
  minConfidence = 0.5,
  limit = 10,
): Promise<AgentMemory[]> {
  const rows = await select<Record<string, unknown>>(
    `SELECT * FROM agent_memories
     WHERE project_id = ? AND confidence >= ?
     ORDER BY confidence DESC, updated_at DESC
     LIMIT ?`,
    [projectId, minConfidence, limit],
  )
  return rows.map(mapMemoryRow)
}

/// 按 ID 查询单条记忆
export async function findMemoryById(
  id: EntityId,
): Promise<AgentMemory | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_memories WHERE id = ?',
    [id],
  )
  return rows.length > 0 ? mapMemoryRow(rows[0]!) : null
}

// ============ 写入 ============

export type InsertMemoryInput = {
  id: EntityId
  projectId: EntityId
  sourceThreadId: EntityId | null
  kind: AgentMemoryKind
  content: string
  confidence: number
}

/// 插入一条记忆
export async function insertMemory(input: InsertMemoryInput): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO agent_memories
     (id, project_id, source_thread_id, kind, content, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.sourceThreadId,
      input.kind,
      input.content,
      input.confidence,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新记忆内容
export async function updateMemoryContent(
  id: EntityId,
  content: string,
  confidence: number,
): Promise<void> {
  await execute(
    'UPDATE agent_memories SET content = ?, confidence = ?, updated_at = ? WHERE id = ?',
    [content, confidence, now(), id],
  )
}

/// 删除一条记忆
export async function deleteMemory(id: EntityId): Promise<void> {
  await execute('DELETE FROM agent_memories WHERE id = ?', [id])
}

/// 删除项目的所有记忆
export async function deleteMemoriesByProject(projectId: EntityId): Promise<void> {
  await execute('DELETE FROM agent_memories WHERE project_id = ?', [projectId])
}
