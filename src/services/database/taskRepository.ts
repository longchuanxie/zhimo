// 任务 Repository
// 对应表：tasks
// 负责所有本地任务相关的数据库访问
// 任务用于跟踪异步操作进度（资料解析、Agent 调用、导出等）

import type {
  Task,
  TaskType,
  TaskStatus,
  EntityId,
} from '@/types'
import { select, execute } from './db'
import {
  mapRow,
  parseJsonField,
  stringifyJsonField,
  generateId,
  now,
} from './mapping'

// ============ 行映射 ============

const TASK_FIELD_MAP: Record<keyof Task, string> = {
  id: 'id',
  projectId: 'project_id',
  taskType: 'task_type',
  objectType: 'object_type',
  objectId: 'object_id',
  status: 'status',
  progress: 'progress',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  payload: 'payload',
  result: 'result',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  createdAt: 'created_at',
}

function mapTask(row: Record<string, unknown>): Task {
  const task = mapRow<Task>(row, TASK_FIELD_MAP)
  return {
    ...task,
    progress: Number(task.progress),
    payload: task.payload === null ? null : parseJsonField<unknown>(task.payload, null),
    result: task.result === null ? null : parseJsonField<unknown>(task.result, null),
  }
}

// ============ 查询 ============

/// 查询所有任务（按创建时间倒序），可按状态筛选
export async function listTasks(status?: TaskStatus): Promise<Task[]> {
  if (status) {
    const rows = await select<Record<string, unknown>>(
      'SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC',
      [status],
    )
    return rows.map(mapTask)
  }

  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM tasks ORDER BY created_at DESC',
  )
  return rows.map(mapTask)
}

/// 查询项目的任务列表
export async function listTasksByProject(
  projectId: EntityId,
): Promise<Task[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return rows.map(mapTask)
}

/// 按 ID 查询任务
export async function findTaskById(id: EntityId): Promise<Task | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM tasks WHERE id = ?',
    [id],
  )
  return rows.length > 0 ? mapTask(rows[0]!) : null
}

// ============ 写入 ============

/// 插入任务
export async function insertTask(input: {
  id?: EntityId
  projectId?: EntityId | null
  taskType: TaskType
  objectType?: string | null
  objectId?: EntityId | null
  payload?: unknown | null
}): Promise<Task> {
  const id = input.id ?? generateId()
  const nowStr = now()

  await execute(
    `INSERT INTO tasks
      (id, project_id, task_type, object_type, object_id, status, progress, error_code, error_message, payload, result, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, NULL, NULL, NULL, ?)`,
    [
      id,
      input.projectId ?? null,
      input.taskType,
      input.objectType ?? null,
      input.objectId ?? null,
      input.payload !== undefined && input.payload !== null
        ? stringifyJsonField(input.payload)
        : null,
      nowStr,
    ],
  )

  const created = await findTaskById(id)
  if (!created) {
    throw new Error('任务写入后查询失败')
  }
  return created
}

/// 更新任务进度与状态
export async function updateTaskProgress(
  id: EntityId,
  progress: number,
  status?: TaskStatus,
): Promise<void> {
  const nowStr = now()
  const finalStatus = status ?? 'running'

  // 状态相关的字段
  let startedAt: string | null = null
  let completedAt: string | null = null
  if (finalStatus === 'running') {
    startedAt = nowStr
  } else if (
    finalStatus === 'succeeded' ||
    finalStatus === 'failed' ||
    finalStatus === 'cancelled'
  ) {
    completedAt = nowStr
  }

  await execute(
    `UPDATE tasks
     SET progress = ?, status = ?,
         started_at = COALESCE(started_at, ?),
         completed_at = COALESCE(?, completed_at)
     WHERE id = ?`,
    [progress, finalStatus, startedAt, completedAt, id],
  )
}

/// 更新任务错误信息
export async function updateTaskError(
  id: EntityId,
  errorCode: string | null,
  errorMessage: string | null,
): Promise<void> {
  const nowStr = now()
  await execute(
    `UPDATE tasks
     SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?
     WHERE id = ?`,
    [errorCode, errorMessage, nowStr, id],
  )
}

/// 更新任务结果
export async function updateTaskResult(
  id: EntityId,
  result: unknown | null,
): Promise<void> {
  await execute(
    `UPDATE tasks SET result = ?, status = 'succeeded', progress = 100, completed_at = ? WHERE id = ?`,
    [result === null ? null : stringifyJsonField(result), now(), id],
  )
}

/// 重置任务为 pending（用于重试）
export async function resetTaskToPending(id: EntityId): Promise<void> {
  await execute(
    `UPDATE tasks
     SET status = 'pending', progress = 0, error_code = NULL, error_message = NULL,
         started_at = NULL, completed_at = NULL
     WHERE id = ?`,
    [id],
  )
}

/// 标记任务为已取消
export async function markTaskCancelled(id: EntityId): Promise<void> {
  await execute(
    `UPDATE tasks SET status = 'cancelled', completed_at = ? WHERE id = ?`,
    [now(), id],
  )
}
