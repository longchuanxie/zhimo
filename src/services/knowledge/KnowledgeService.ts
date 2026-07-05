// 知识库 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §7
// 负责知识条目的业务逻辑：创建、编辑、状态流转、AI 权限、版本演进
//
// 知识库与卡片的区别：
// - 卡片：结构化的知识单元，从资料/对话中提取，状态较轻
// - 知识：已沉淀的事实/设定/规则，支持版本演进（replaced_by_id）和置信度

import type { Knowledge, KnowledgeStatus } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  listKnowledge as repoListKnowledge,
  findKnowledgeById,
  insertKnowledge,
  insertKnowledgeVersion,
  updateKnowledgeContent,
  updateKnowledgeStatus,
  updateKnowledgeAiUsage,
  updateKnowledgeConfidence,
  markReplacedBy,
  findKnowledgeByReplacedById,
  softDeleteKnowledge,
} from '@/services/database/knowledgeRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateKnowledgeInput = {
  projectId: string
  title: string
  type: string
  content: string
  summary?: string
  sourceType?: string
  sourceId?: string
  aiUsageAllowed?: boolean
  confidence?: number
}

export type UpdateKnowledgeInput = {
  knowledgeId: string
  patch: Partial<{
    title: string
    type: string
    content: string
    summary: string
  }>
}

export type ReplaceKnowledgeInput = {
  /// 旧知识 ID（被替换的版本）
  oldKnowledgeId: string
  /// 新版本的可编辑字段
  title: string
  type: string
  content: string
  summary?: string
  confidence?: number | null
}

// ============ Service 方法 ============

/// 查询知识列表
export async function listKnowledge(
  projectId: string,
  status?: KnowledgeStatus,
): Promise<ServiceResult<Knowledge[]>> {
  try {
    const items = await repoListKnowledge(projectId, status)
    return ok(items)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询知识详情
export async function getKnowledge(
  knowledgeId: string,
): Promise<ServiceResult<Knowledge>> {
  try {
    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }
    return ok(item)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建知识
export async function createKnowledge(
  input: CreateKnowledgeInput,
): Promise<ServiceResult<Knowledge>> {
  try {
    if (!input.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识标题不能为空',
        retryable: false,
      })
    }

    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识内容不能为空',
        retryable: false,
      })
    }

    if (input.confidence !== undefined) {
      if (input.confidence < 0 || input.confidence > 1) {
        return err({
          code: VALIDATION_ERROR,
          message: '置信度必须在 0~1 之间',
          retryable: false,
        })
      }
    }

    const knowledgeId = generateId()

    await insertKnowledge({
      id: knowledgeId,
      projectId: input.projectId,
      title: input.title.trim(),
      type: input.type || 'fact',
      content: input.content,
      summary: input.summary?.trim() || null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      aiUsageAllowed: input.aiUsageAllowed ?? true,
      confidence: input.confidence ?? null,
    })

    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '知识创建后查询失败',
        retryable: true,
      })
    }

    return ok(item)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 创建知识的新版本（版本演进）
///
/// 业务流程：
/// 1. 查询旧知识，校验存在且状态非 deprecated
/// 2. 计算 newVersion = old.version + 1
/// 3. 调用 insertKnowledgeVersion 写入新知识（status='pending'，继承 projectId/sourceType/sourceId/aiUsageAllowed）
/// 4. 调用 markReplacedBy(oldId, newId) 将旧知识标记为 deprecated
/// 5. 返回新知识对象
///
/// @param input.oldKnowledgeId  旧知识 ID
/// @param input.title/type/content/summary/confidence  新版本的可编辑字段
export async function replaceKnowledge(
  input: ReplaceKnowledgeInput,
): Promise<ServiceResult<Knowledge>> {
  try {
    // 校验输入
    if (!input.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识标题不能为空',
        retryable: false,
      })
    }
    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识内容不能为空',
        retryable: false,
      })
    }

    // 1. 查询旧知识
    const old = await findKnowledgeById(input.oldKnowledgeId)
    if (!old) {
      return err({
        code: NOT_FOUND,
        message: '没有找到要替换的旧知识',
        retryable: false,
      })
    }

    // 2. 校验旧知识状态（已被替换的版本不能再衍生新版本）
    if (old.status === 'deprecated') {
      return err({
        code: VALIDATION_ERROR,
        message: '已被替换的旧版本不能再创建新版本',
        retryable: false,
      })
    }

    // 3. 创建新版本（继承 projectId/sourceType/sourceId/aiUsageAllowed）
    const newId = generateId()
    const newVersion = old.version + 1
    await insertKnowledgeVersion({
      id: newId,
      projectId: old.projectId,
      title: input.title.trim(),
      type: input.type,
      content: input.content,
      summary: input.summary?.trim() || null,
      sourceType: old.sourceType,
      sourceId: old.sourceId,
      aiUsageAllowed: old.aiUsageAllowed,
      confidence: input.confidence ?? null,
      version: newVersion,
    })

    // 4. 标记旧知识为 deprecated
    await markReplacedBy(old.id, newId)

    // 5. 查询并返回新知识
    const created = await findKnowledgeById(newId)
    if (!created) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '新版本创建后查询失败',
        retryable: true,
      })
    }
    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询当前版本的上一个旧版本（即被当前版本替换的旧知识）
///
/// 用于详情页版本链路展示
///
/// @param currentId 当前知识 ID
/// @returns 旧版本知识（若无则 null）
export async function getPreviousVersion(
  currentId: string,
): Promise<ServiceResult<Knowledge | null>> {
  try {
    const previous = await findKnowledgeByReplacedById(currentId)
    return ok(previous)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新知识内容
export async function updateKnowledge(
  input: UpdateKnowledgeInput,
): Promise<ServiceResult<Knowledge>> {
  try {
    const item = await findKnowledgeById(input.knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    if (input.patch.title !== undefined && !input.patch.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识标题不能为空',
        retryable: false,
      })
    }

    if (input.patch.content !== undefined && !input.patch.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '知识内容不能为空',
        retryable: false,
      })
    }

    await updateKnowledgeContent(input.knowledgeId, input.patch)

    const updated = await findKnowledgeById(input.knowledgeId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新知识状态
export async function updateKnowledgeStatusService(
  knowledgeId: string,
  status: KnowledgeStatus,
): Promise<ServiceResult<Knowledge>> {
  try {
    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    await updateKnowledgeStatus(knowledgeId, status)

    const updated = await findKnowledgeById(knowledgeId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新知识 AI 使用权限
export async function updateKnowledgeAiUsageService(
  knowledgeId: string,
  allowed: boolean,
): Promise<ServiceResult<Knowledge>> {
  try {
    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    await updateKnowledgeAiUsage(knowledgeId, allowed)

    const updated = await findKnowledgeById(knowledgeId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新知识置信度
export async function updateKnowledgeConfidenceService(
  knowledgeId: string,
  confidence: number | null,
): Promise<ServiceResult<Knowledge>> {
  try {
    if (confidence !== null && (confidence < 0 || confidence > 1)) {
      return err({
        code: VALIDATION_ERROR,
        message: '置信度必须在 0~1 之间',
        retryable: false,
      })
    }

    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    await updateKnowledgeConfidence(knowledgeId, confidence)

    const updated = await findKnowledgeById(knowledgeId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除知识（软删除）
export async function deleteKnowledge(
  knowledgeId: string,
): Promise<ServiceResult<void>> {
  try {
    const item = await findKnowledgeById(knowledgeId)
    if (!item) {
      return err({
        code: NOT_FOUND,
        message: '知识条目不存在',
        retryable: false,
      })
    }

    await softDeleteKnowledge(knowledgeId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
