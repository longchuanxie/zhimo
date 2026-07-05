// Agent Memory Service
// 负责 Agent 长期记忆的创建、召回、更新、删除
//
// 职责：
// - 参数校验
// - 数据库访问
// - 错误转换
// - 返回统一结果

import type { AgentMemory, AgentMemoryKind, EntityId } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { UNKNOWN_ERROR, NOT_FOUND, VALIDATION_ERROR } from '@/constants/errors'
import {
  listMemoriesByProject,
  listMemoriesForRecall,
  findMemoryById,
  insertMemory,
  updateMemoryContent,
  deleteMemory,
  deleteMemoriesByProject,
} from '@/services/database/agentMemoryRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateMemoryInput = {
  projectId: EntityId
  sourceThreadId?: EntityId | null
  kind: AgentMemoryKind
  content: string
  confidence?: number
}

export type UpdateMemoryInput = {
  content: string
  confidence: number
}

// ============ 查询 ============

/// 查询项目的所有记忆
export async function listMemories(
  projectId: EntityId,
): Promise<ServiceResult<AgentMemory[]>> {
  try {
    const memories = await listMemoriesByProject(projectId)
    return ok(memories)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 召回项目记忆（用于上下文注入）
///
/// 按置信度降序返回，默认召回 10 条
export async function recallMemories(
  projectId: EntityId,
  limit = 10,
): Promise<ServiceResult<AgentMemory[]>> {
  try {
    const memories = await listMemoriesForRecall(projectId, 0.5, limit)
    return ok(memories)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 按 ID 查询单条记忆
export async function getMemory(
  id: EntityId,
): Promise<ServiceResult<AgentMemory>> {
  try {
    const memory = await findMemoryById(id)
    if (!memory) {
      return err({ code: NOT_FOUND, message: '记忆不存在', retryable: false })
    }
    return ok(memory)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 写入 ============

/// 创建一条记忆
export async function createMemory(
  input: CreateMemoryInput,
): Promise<ServiceResult<AgentMemory>> {
  try {
    // 参数校验
    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '记忆内容不能为空',
        retryable: false,
      })
    }
    if (!input.projectId) {
      return err({
        code: VALIDATION_ERROR,
        message: '项目 ID 不能为空',
        retryable: false,
      })
    }

    const id = generateId()
    const confidence = input.confidence ?? 0.5

    await insertMemory({
      id,
      projectId: input.projectId,
      sourceThreadId: input.sourceThreadId ?? null,
      kind: input.kind,
      content: input.content.trim(),
      confidence,
    })

    const memory = await findMemoryById(id)
    if (!memory) {
      return err({
        code: UNKNOWN_ERROR,
        message: '记忆创建后查询失败',
        retryable: true,
      })
    }
    return ok(memory)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新记忆内容与置信度
export async function updateMemory(
  id: EntityId,
  input: UpdateMemoryInput,
): Promise<ServiceResult<AgentMemory>> {
  try {
    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '记忆内容不能为空',
        retryable: false,
      })
    }

    const existing = await findMemoryById(id)
    if (!existing) {
      return err({ code: NOT_FOUND, message: '记忆不存在', retryable: false })
    }

    await updateMemoryContent(id, input.content.trim(), input.confidence)

    const updated = await findMemoryById(id)
    if (!updated) {
      return err({
        code: UNKNOWN_ERROR,
        message: '记忆更新后查询失败',
        retryable: true,
      })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除一条记忆
export async function removeMemory(
  id: EntityId,
): Promise<ServiceResult<void>> {
  try {
    const existing = await findMemoryById(id)
    if (!existing) {
      return err({ code: NOT_FOUND, message: '记忆不存在', retryable: false })
    }
    await deleteMemory(id)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除项目的所有记忆
export async function removeMemoriesByProject(
  projectId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    await deleteMemoriesByProject(projectId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
