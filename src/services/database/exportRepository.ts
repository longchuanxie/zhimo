// 导出任务 Repository
// 对应表：export_tasks
// 负责所有导出任务相关的数据库访问

import type {
  ExportTask,
  ExportScope,
  ExportFormat,
  ExportTaskStatus,
  ExportOptions,
  EntityId,
} from '@/types'
import { select, execute } from './db'
import { mapRow, parseJsonField, stringifyJsonField, generateId, now } from './mapping'

// ============ 行映射 ============

const EXPORT_TASK_FIELD_MAP: Record<keyof ExportTask, string> = {
  id: 'id',
  projectId: 'project_id',
  exportScope: 'export_scope',
  exportFormat: 'export_format',
  documentIds: 'document_ids',
  outlineNodeIds: 'outline_node_ids',
  exportOptions: 'export_options',
  filePath: 'file_path',
  status: 'status',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  createdAt: 'created_at',
  completedAt: 'completed_at',
}

function mapExportTask(row: Record<string, unknown>): ExportTask {
  const task = mapRow<ExportTask>(row, EXPORT_TASK_FIELD_MAP)
  return {
    ...task,
    documentIds: parseJsonField<EntityId[]>(task.documentIds, []),
    outlineNodeIds: parseJsonField<EntityId[]>(task.outlineNodeIds, []),
    exportOptions: parseJsonField<ExportOptions | null>(task.exportOptions, null),
  }
}

// ============ 查询 ============

/// 查询项目的导出任务列表（按创建时间倒序）
export async function listExportTasksByProject(
  projectId: EntityId,
): Promise<ExportTask[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM export_tasks WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return rows.map(mapExportTask)
}

/// 按 ID 查询导出任务
export async function findExportTaskById(
  id: EntityId,
): Promise<ExportTask | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM export_tasks WHERE id = ?',
    [id],
  )
  return rows.length > 0 ? mapExportTask(rows[0]!) : null
}

// ============ 写入 ============

/// 插入导出任务
export async function insertExportTask(input: {
  id?: EntityId
  projectId: EntityId
  exportScope: ExportScope
  exportFormat: ExportFormat
  documentIds?: EntityId[] | null
  outlineNodeIds?: EntityId[] | null
  exportOptions?: ExportOptions | null
}): Promise<ExportTask> {
  const id = input.id ?? generateId()
  const nowStr = now()

  await execute(
    `INSERT INTO export_tasks
      (id, project_id, export_scope, export_format, document_ids, outline_node_ids, export_options, file_path, status, error_code, error_message, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, ?, NULL)`,
    [
      id,
      input.projectId,
      input.exportScope,
      input.exportFormat,
      input.documentIds ? stringifyJsonField(input.documentIds) : null,
      input.outlineNodeIds ? stringifyJsonField(input.outlineNodeIds) : null,
      input.exportOptions ? stringifyJsonField(input.exportOptions) : null,
      nowStr,
    ],
  )

  const created = await findExportTaskById(id)
  if (!created) {
    throw new Error('导出任务写入后查询失败')
  }
  return created
}

/// 更新导出任务状态
export async function updateExportTaskStatus(
  id: EntityId,
  status: ExportTaskStatus,
  errorCode?: string | null,
  errorMessage?: string | null,
): Promise<void> {
  const completedAt = status === 'succeeded' || status === 'failed' || status === 'cancelled' ? now() : null
  await execute(
    `UPDATE export_tasks
     SET status = ?, error_code = ?, error_message = ?, completed_at = COALESCE(?, completed_at)
     WHERE id = ?`,
    [
      status,
      errorCode ?? null,
      errorMessage ?? null,
      completedAt,
      id,
    ],
  )
}

/// 更新导出文件路径
export async function updateExportTaskFilePath(
  id: EntityId,
  filePath: string,
): Promise<void> {
  await execute(
    'UPDATE export_tasks SET file_path = ? WHERE id = ?',
    [filePath, id],
  )
}
