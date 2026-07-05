// Agent 待确认操作 Repository
// 对应表：agent_pending_actions
// 负责 Agent 工具调用中写操作意图的持久化与查询
//
// 架构约束：
// - 仅 Repository 层直接执行 SQL
// - Service 层通过 PendingActionService 调用本模块
// - UI 层禁止直接使用

import type {
  PendingToolAction,
  PendingActionStatus,
  EntityId,
} from '@/types'
import { select, execute } from './db'
import { mapRow, now, parseJsonField, stringifyJsonField } from './mapping'

// ============ 行映射 ============

const PENDING_ACTION_FIELD_MAP: Record<keyof PendingToolAction, string> = {
  id: 'id',
  messageId: 'message_id',
  projectId: 'project_id',
  threadId: 'thread_id',
  toolName: 'tool_name',
  args: 'args',
  summary: 'summary',
  status: 'status',
  createdAt: 'created_at',
  appliedAt: 'applied_at',
}

function mapPendingAction(row: Record<string, unknown>): PendingToolAction {
  const action = mapRow<PendingToolAction>(row, PENDING_ACTION_FIELD_MAP)
  return {
    ...action,
    args: parseJsonField<Record<string, unknown>>(action.args, {}),
  }
}

// ============ Repository 方法 ============

/// 创建待确认操作
export async function insertPendingAction(input: {
  id: EntityId
  messageId: EntityId
  projectId: EntityId
  threadId: EntityId
  toolName: string
  args: Record<string, unknown>
  summary: string
  status: PendingActionStatus
}): Promise<void> {
  await execute(
    `INSERT INTO agent_pending_actions (
      id, message_id, project_id, thread_id, tool_name, args, summary, status, created_at, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      input.id,
      input.messageId,
      input.projectId,
      input.threadId,
      input.toolName,
      stringifyJsonField(input.args),
      input.summary,
      input.status,
      now(),
    ],
  )
}

/// 根据 ID 查询待确认操作
export async function findPendingActionById(
  id: EntityId,
): Promise<PendingToolAction | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_pending_actions WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapPendingAction(rows[0]!)
}

/// 查询消息关联的所有待确认操作（按创建时间正序）
export async function listPendingActionsByMessage(
  messageId: EntityId,
): Promise<PendingToolAction[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_pending_actions WHERE message_id = ? ORDER BY created_at ASC',
    [messageId],
  )
  return rows.map(mapPendingAction)
}

/// 查询线程下所有待确认操作（按创建时间倒序，便于 UI 查看最新）
export async function listPendingActionsByThread(
  threadId: EntityId,
): Promise<PendingToolAction[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_pending_actions WHERE thread_id = ? ORDER BY created_at DESC',
    [threadId],
  )
  return rows.map(mapPendingAction)
}

/// 更新待确认操作状态
///
/// @param id 操作 ID
/// @param status 目标状态（applied / rejected）
/// @param appliedAt 应用时间，null 表示未应用（rejected 时也可记录时间）
export async function updatePendingActionStatus(
  id: EntityId,
  status: PendingActionStatus,
): Promise<void> {
  await execute(
    'UPDATE agent_pending_actions SET status = ?, applied_at = ? WHERE id = ?',
    [status, now(), id],
  )
}
