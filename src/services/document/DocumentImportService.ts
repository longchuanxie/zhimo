// 项目从文档导入编排 Service
// 对应任务:项目从外部文档导入
//
// 职责:
// - pickAndParseDocument: 弹文件选择对话框 → 调 Rust parse_document_structured → 校验非空
// - createProjectFromDocument: 创建项目 → 创建文档 → 写入 TipTap 正文
//
// 架构约束:
// - UI 层只调本 Service,不直接 invoke Rust / 不直接调 dialog / 不直接操作 DB
// - 编排 ProjectService / DocumentService,不重复其内部逻辑
//
// 技术债:
// - TD-IMPORT-05:fromInvokeError 仅此处使用,未抽为公共 util

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { AppError } from '@/types/error'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  OPERATION_CANCELLED,
  DOCUMENT_EMPTY_CONTENT,
  DOCUMENT_FORMAT_UNSUPPORTED,
  DOCUMENT_IMPORT_FAILED,
  SOURCE_OCR_REQUIRED,
} from '@/constants/errors'
import { SUPPORTED_IMPORT_EXTENSIONS, IMPORT_DEFAULT_DOCUMENT_TITLE } from '@/constants/projectImport'
import type {
  StructuredDoc,
  CreateProjectFromDocumentInput,
  CreatedProjectWithDocument,
} from '@/types/projectImport'
import { createProject, deleteProject } from '@/services/project/ProjectService'
import {
  createDocument,
  deleteDocument,
  setDocumentInitialContent,
} from '@/services/document/DocumentService'
import { structuredDocToTipTap } from '@/utils/tiptapConverters'

// ============ 内部工具 ============

/// Rust 端错误码前缀 → 前端错误码映射
const INVOKE_ERROR_CODE_MAP: Record<string, AppError> = {
  DOCUMENT_FORMAT_UNSUPPORTED: {
    code: DOCUMENT_FORMAT_UNSUPPORTED,
    message: '暂不支持该文档格式,仅支持 .md/.txt/.docx/.pdf',
    retryable: false,
  },
  SOURCE_OCR_REQUIRED: {
    code: SOURCE_OCR_REQUIRED,
    message: '检测到扫描版 PDF,暂不支持 OCR 识别',
    retryable: false,
  },
}

/// 把 Tauri invoke 抛出的错误转换为 AppError
/// Rust 端返回 Err(String) 时,invoke 抛出的值通常为字符串
/// 字符串可能为纯错误码(如 "SOURCE_OCR_REQUIRED")或 "CODE: detail" 格式
function fromInvokeError(error: unknown): AppError {
  if (typeof error === 'string') {
    // 优先匹配 "CODE: ..." 或纯 "CODE"
    const codeMatch = error.match(/^([A-Z_]+)(?::|$)/)
    if (codeMatch) {
      const code = codeMatch[1]
      if (INVOKE_ERROR_CODE_MAP[code]) {
        return INVOKE_ERROR_CODE_MAP[code]
      }
    }
    return {
      code: DOCUMENT_IMPORT_FAILED,
      message: error,
      retryable: true,
    }
  }
  return fromUnknown(error)
}

/// 执行回滚,回滚失败静默忽略
/// 策略:保留原始错误,不因回滚失败掩盖;用户可在项目列表手动清理孤儿数据
async function safeRollback(rollback: () => Promise<unknown>): Promise<void> {
  try {
    await rollback()
  } catch {
    // 回滚失败静默忽略
  }
}

// ============ 对外方法 ============

/// 选择文档并解析为 StructuredDoc
///
/// 流程:
/// 1. 弹出 Tauri 文件选择对话框(限定 .md/.markdown/.txt/.docx/.pdf)
/// 2. 调 invoke('parse_document_structured') 解析
/// 3. 校验 nodes 与 plainText 非空
///
/// 用户取消选择返回 OPERATION_CANCELLED;
/// Rust 端返回错误码按 INVOKE_ERROR_CODE_MAP 映射,其他失败归为 DOCUMENT_IMPORT_FAILED
export async function pickAndParseDocument(): Promise<ServiceResult<StructuredDoc>> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: '文档',
        extensions: SUPPORTED_IMPORT_EXTENSIONS.map((ext) => ext.slice(1)),
      },
    ],
  })

  if (!selected) {
    return err({
      code: OPERATION_CANCELLED,
      message: '已取消选择文档',
      retryable: false,
    })
  }

  const filePath = selected as string

  try {
    const doc = await invoke<StructuredDoc>('parse_document_structured', { filePath })
    if (!doc.nodes.length || !doc.plainText.trim()) {
      return err({
        code: DOCUMENT_EMPTY_CONTENT,
        message: '文档内容为空,无法创建项目',
        retryable: false,
      })
    }
    return ok(doc)
  } catch (error) {
    return err(fromInvokeError(error))
  }
}

/// 创建项目 + 创建文档 + 写入 TipTap 正文
///
/// 流程:
/// 1. ProjectService.createProject(元数据)
/// 2. DocumentService.createDocument(标题默认 IMPORT_DEFAULT_DOCUMENT_TITLE)
/// 3. DocumentService.setDocumentInitialContent(TipTap JSON + plainText + wordCount)
///
/// 失败策略:
/// - createDocument 失败 → 回滚 deleteProject
/// - setDocumentInitialContent 失败 → 回滚 deleteDocument + deleteProject
/// - 回滚失败静默忽略,保留原始错误(用户可手动清理孤儿数据)
export async function createProjectFromDocument(
  input: CreateProjectFromDocumentInput,
): Promise<ServiceResult<CreatedProjectWithDocument>> {
  // 1. 创建项目
  const projectResult = await createProject({
    name: input.meta.name,
    type: input.meta.type,
    description: input.meta.description || undefined,
    writingGoal: input.meta.writingGoal || undefined,
    targetReader: input.meta.targetReader || undefined,
    targetWordCount: input.meta.targetWordCount || undefined,
  })
  if (!projectResult.ok) return err(projectResult.error)
  const projectId = projectResult.data.id

  // 2. 创建文档
  const documentTitle = input.documentTitle.trim() || IMPORT_DEFAULT_DOCUMENT_TITLE
  const docResult = await createDocument({
    projectId,
    title: documentTitle,
  })
  if (!docResult.ok) {
    // 回滚:删除已创建的项目
    await safeRollback(() => deleteProject(projectId))
    return err(docResult.error)
  }
  const documentId = docResult.data.id

  // 3. 写入 TipTap 正文
  const contentJson = structuredDocToTipTap(input.structuredDoc)
  const initResult = await setDocumentInitialContent({
    documentId,
    contentJson,
    plainText: input.structuredDoc.plainText,
    wordCount: input.structuredDoc.wordCount,
  })
  if (!initResult.ok) {
    // 回滚:删除已创建的文档和项目
    await safeRollback(async () => {
      await deleteDocument(documentId)
      await deleteProject(projectId)
    })
    return err(initResult.error)
  }

  return ok({ projectId, documentId })
}
