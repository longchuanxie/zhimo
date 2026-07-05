// 文档工具集
// 为 Agent 提供文档的查询与写操作能力
//
// 工具列表（4 个）：
// - list_documents（读）：列出项目所有文档
// - get_document（读）：获取文档详情
// - create_document（写）：创建文档（待确认）
// - append_document_content（写）：追加/替换正文（待确认）
//
// 注意：append_document_content 的 replace_section 模式暂未实现（技术债 PA-001）

import type { ToolDefinition, ToolExecutor } from '@/types'
import {
  listDocuments,
  getDocument,
} from '@/services/document/DocumentService'
import type { PendingActionCollector } from './pendingActionCollector'
import {
  collectPending,
  errorResult,
  readNonEmptyString,
  readString,
} from './toolHelpers'

/// list_documents 工具定义
export const LIST_DOCUMENTS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_documents',
    description:
      '列出当前项目的所有文档（含标题、状态、字数、最后编辑时间）。用于了解项目写作进度。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

/// get_document 工具定义
export const GET_DOCUMENT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_document',
    description:
      '根据文档 ID 获取文档详情（含纯文本正文、字数、状态、摘要）。',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: '文档 ID',
        },
      },
      required: ['documentId'],
    },
  },
}

/// create_document 工具定义（写，待确认）
export const CREATE_DOCUMENT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_document',
    description:
      '在当前项目中创建一个新文档。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '文档标题（必填）',
        },
        content: {
          type: 'string',
          description: '文档初始正文（可选，纯文本）',
        },
        outlineNodeId: {
          type: 'string',
          description: '关联的大纲节点 ID（可选）',
        },
      },
      required: ['title'],
    },
  },
}

/// append_document_content 工具定义（写，待确认）
export const APPEND_DOCUMENT_CONTENT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'append_document_content',
    description:
      '向已存在的文档写入正文。支持 mode=append（追加到末尾）、mode=replace_all（替换全文）、mode=replace_selection（替换选区）。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: '目标文档 ID',
        },
        content: {
          type: 'string',
          description: '要写入的正文内容（纯文本）',
        },
        mode: {
          type: 'string',
          description: '写入模式：append（追加到末尾）、replace_all（替换全文）、replace_selection（替换选区）',
        },
      },
      required: ['documentId', 'content'],
    },
  },
}

/// 文档工具定义列表
export const DOCUMENT_TOOLS: ToolDefinition[] = [
  LIST_DOCUMENTS_TOOL,
  GET_DOCUMENT_TOOL,
  CREATE_DOCUMENT_TOOL,
  APPEND_DOCUMENT_CONTENT_TOOL,
]

/// 构造文档工具执行器
export function createDocumentToolExecutors(
  projectId: string,
  collector?: PendingActionCollector,
): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>()

  // list_documents（读）
  executors.set('list_documents', async () => {
    const result = await listDocuments(projectId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    return JSON.stringify({
      documents: result.data.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        status: d.status,
        wordCount: d.wordCount,
        outlineNodeId: d.outlineNodeId,
        summary: d.summary,
        lastEditedAt: d.lastEditedAt,
      })),
      total: result.data.length,
    })
  })

  // get_document（读）
  executors.set('get_document', async (args) => {
    const documentId = readNonEmptyString(args, 'documentId')
    if (!documentId) {
      return errorResult('documentId 不能为空')
    }

    const result = await getDocument(documentId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    const d = result.data
    return JSON.stringify({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      wordCount: d.wordCount,
      plainText: d.plainText,
      summary: d.summary,
      outlineNodeId: d.outlineNodeId,
      lastEditedAt: d.lastEditedAt,
      createdAt: d.createdAt,
    })
  })

  // create_document（写，待确认）
  executors.set('create_document', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const title = readNonEmptyString(args, 'title')
    if (!title) return errorResult('title 不能为空')

    const content = readString(args, 'content')
    const outlineNodeId = readString(args, 'outlineNodeId')

    const summary = `创建文档「${title}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'create_document',
        args: {
          projectId,
          title,
          content: content ?? undefined,
          outlineNodeId: outlineNodeId ?? undefined,
        },
        summary,
      }),
    )
  })

  // append_document_content（写，待确认）
  executors.set('append_document_content', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const documentId = readNonEmptyString(args, 'documentId')
    const content = readNonEmptyString(args, 'content')
    const mode = readString(args, 'mode')

    if (!documentId) return errorResult('documentId 不能为空')
    if (!content) return errorResult('content 不能为空')

    const finalMode = mode ?? 'append'
    if (!['append', 'replace_all', 'replace_selection'].includes(finalMode)) {
      return errorResult('当前仅支持 mode=append / replace_all / replace_selection')
    }

    const summary =
      finalMode === 'replace_all'
        ? `替换文档「${documentId}」全文为 ${content.length} 字内容`
        : `向文档「${documentId}」追加 ${content.length} 字内容`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'append_document_content',
        args: { documentId, content, mode: finalMode },
        summary,
      }),
    )
  })

  return executors
}
