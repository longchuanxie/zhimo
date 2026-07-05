// 文档 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §4
// 负责文档相关的业务逻辑

import type { Document } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  listDocuments as repoListDocuments,
  findDocumentById,
  insertDocument,
  updateDocumentContent,
  updateDocumentTitle,
  updateDocumentStatus,
  softDeleteDocument,
} from '@/services/database/documentRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateDocumentInput = {
  projectId: string
  title: string
  outlineNodeId?: string
}

export type AutosaveDocumentInput = {
  projectId: string
  documentId: string
  contentJson: unknown
  plainText: string
  wordCount: number
  clientRevision?: number
}

export type AutosaveResult = {
  documentId: string
  savedAt: string
  wordCount: number
}

export type SetInitialContentInput = {
  documentId: string
  contentJson: unknown
  plainText: string
  wordCount: number
}

// ============ Service 方法 ============

/// 查询文档列表
export async function listDocuments(
  projectId: string,
): Promise<ServiceResult<Document[]>> {
  try {
    const documents = await repoListDocuments(projectId)
    return ok(documents)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询文档详情
export async function getDocument(
  documentId: string,
): Promise<ServiceResult<Document>> {
  try {
    const document = await findDocumentById(documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }
    return ok(document)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建文档
export async function createDocument(
  input: CreateDocumentInput,
): Promise<ServiceResult<Document>> {
  try {
    // 参数校验
    if (!input.title || input.title.trim().length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '文档标题不能为空',
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

    const documentId = generateId()

    await insertDocument({
      id: documentId,
      projectId: input.projectId,
      title: input.title.trim(),
      type: 'normal',
      outlineNodeId: input.outlineNodeId ?? null,
    })

    const document = await findDocumentById(documentId)
    if (!document) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '文档创建后查询失败',
        retryable: true,
      })
    }

    return ok(document)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 自动保存文档
/// 规则：自动更新 word_count、last_edited_at
export async function autosaveDocument(
  input: AutosaveDocumentInput,
): Promise<ServiceResult<AutosaveResult>> {
  try {
    const document = await findDocumentById(input.documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    await updateDocumentContent({
      documentId: input.documentId,
      contentJson: input.contentJson,
      plainText: input.plainText,
      wordCount: input.wordCount,
    })

    return ok({
      documentId: input.documentId,
      savedAt: new Date().toISOString(),
      wordCount: input.wordCount,
    })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新文档标题
export async function updateDocumentTitleService(
  documentId: string,
  title: string,
): Promise<ServiceResult<Document>> {
  try {
    if (!title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '文档标题不能为空',
        retryable: false,
      })
    }

    await updateDocumentTitle(documentId, title.trim())

    const document = await findDocumentById(documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    return ok(document)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新文档状态
export async function updateDocumentStatusService(
  documentId: string,
  status: Document['status'],
): Promise<ServiceResult<Document>> {
  try {
    const document = await findDocumentById(documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    const validStatuses: Document['status'][] = [
      'draft',
      'writing',
      'reviewing',
      'completed',
      'archived',
    ]
    if (!validStatuses.includes(status)) {
      return err({
        code: VALIDATION_ERROR,
        message: '无效的文档状态',
        retryable: false,
      })
    }

    await updateDocumentStatus(documentId, status)

    const updated = await findDocumentById(documentId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除文档（软删除）
export async function deleteDocument(
  documentId: string,
): Promise<ServiceResult<void>> {
  try {
    const document = await findDocumentById(documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    await softDeleteDocument(documentId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 写入文档初始正文(用于「从文档创建项目」流程)
///
/// 与 autosaveDocument 的区别:
/// - 不要求 projectId(调用方已通过 createDocument 创建文档)
/// - 不返回 AutosaveResult(初始写入无需反馈保存时间)
/// - 复用同一个 updateDocumentContent 仓储方法
export async function setDocumentInitialContent(
  input: SetInitialContentInput,
): Promise<ServiceResult<void>> {
  try {
    const document = await findDocumentById(input.documentId)
    if (!document) {
      return err({
        code: NOT_FOUND,
        message: '文档不存在',
        retryable: false,
      })
    }

    await updateDocumentContent({
      documentId: input.documentId,
      contentJson: input.contentJson,
      plainText: input.plainText,
      wordCount: input.wordCount,
    })

    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
