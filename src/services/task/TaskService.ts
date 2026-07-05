// 任务 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §13
// 对应任务：DEV-088
//
// 职责：
// - 创建任务记录
// - 更新任务进度与状态
// - 重试失败任务
// - 取消任务
//
// 说明：
// MVP 阶段任务中心主要用于展示任务状态历史，
// 实际异步执行由各业务 Service（SourceService/AgentService/ExportService）负责。
// TaskService 提供统一的任务记录查询与管理接口。

import type { Task, TaskType, TaskStatus } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { NOT_FOUND } from '@/constants/errors'
import {
  insertTask,
  findTaskById,
  listTasks,
  listTasksByProject,
  updateTaskProgress,
  updateTaskError,
  updateTaskResult,
  resetTaskToPending,
  markTaskCancelled,
} from '@/services/database/taskRepository'

// ============ 类型定义 ============

export type CreateTaskInput = {
  projectId?: string
  taskType: TaskType
  objectType?: string
  objectId?: string
  payload?: unknown
}

export type UpdateTaskProgressInput = {
  taskId: string
  progress: number
  status?: TaskStatus
}

// ============ Service 方法 ============

/// 创建任务
export async function createTask(
  input: CreateTaskInput,
): Promise<ServiceResult<Task>> {
  try {
    // 进度校验
    if (input.payload !== undefined && input.payload === null) {
      // payload 允许为 null/undefined
    }

    const task = await insertTask({
      projectId: input.projectId ?? null,
      taskType: input.taskType,
      objectType: input.objectType ?? null,
      objectId: input.objectId ?? null,
      payload: input.payload ?? null,
    })
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新任务进度
export async function updateTaskProgressService(
  input: UpdateTaskProgressInput,
): Promise<ServiceResult<Task>> {
  try {
    // 进度校验
    const progress = Math.max(0, Math.min(100, input.progress))

    await updateTaskProgress(input.taskId, progress, input.status)
    const task = await findTaskById(input.taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 标记任务成功并写入结果
export async function completeTask(
  taskId: string,
  result?: unknown,
): Promise<ServiceResult<Task>> {
  try {
    await updateTaskResult(taskId, result ?? null)
    const task = await findTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 标记任务失败
export async function failTask(
  taskId: string,
  errorCode: string,
  errorMessage: string,
): Promise<ServiceResult<Task>> {
  try {
    await updateTaskError(taskId, errorCode, errorMessage)
    const task = await findTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重试任务
export async function retryTask(
  taskId: string,
): Promise<ServiceResult<Task>> {
  try {
    const task = await findTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }

    // 仅失败/取消的任务可重试
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return err({
        code: 'VALIDATION_ERROR',
        message: '仅失败或已取消的任务可重试',
        retryable: false,
      })
    }

    await resetTaskToPending(taskId)
    const reset = await findTaskById(taskId)
    return ok(reset!)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 取消任务
export async function cancelTask(
  taskId: string,
): Promise<ServiceResult<Task>> {
  try {
    const task = await findTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }

    // 仅 pending/running 的任务可取消
    if (task.status !== 'pending' && task.status !== 'running') {
      return err({
        code: 'VALIDATION_ERROR',
        message: '仅等待中或运行中的任务可取消',
        retryable: false,
      })
    }

    await markTaskCancelled(taskId)
    const cancelled = await findTaskById(taskId)
    return ok(cancelled!)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询所有任务（可按状态筛选）
export async function listAllTasks(
  status?: TaskStatus,
): Promise<ServiceResult<Task[]>> {
  try {
    const tasks = await listTasks(status)
    return ok(tasks)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询项目的任务列表
export async function listProjectTasks(
  projectId: string,
): Promise<ServiceResult<Task[]>> {
  try {
    const tasks = await listTasksByProject(projectId)
    return ok(tasks)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取任务详情
export async function getTask(
  taskId: string,
): Promise<ServiceResult<Task>> {
  try {
    const task = await findTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
