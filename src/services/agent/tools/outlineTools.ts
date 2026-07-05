// 大纲工具集
// 为 Agent 提供大纲节点的查询与写操作能力
//
// 工具列表（5 个）：
// - list_outline_nodes（读）：列出项目大纲所有节点
// - get_outline_node（读）：获取单条节点详情
// - create_outline_node（写）：创建节点（待确认）
// - update_outline_node（写）：更新节点（待确认）
// - delete_outline_node（写）：删除节点（待确认）

import type { ToolDefinition, ToolExecutor } from '@/types'
import { getOutline } from '@/services/outline/OutlineService'
import type { PendingActionCollector } from './pendingActionCollector'
import {
  collectPending,
  errorResult,
  readNonEmptyString,
  readString,
} from './toolHelpers'

/// list_outline_nodes 工具定义
export const LIST_OUTLINE_NODES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_outline_nodes',
    description:
      '列出当前项目的所有大纲节点（含父子关系、状态、目标字数）。用于了解项目结构、规划写作进度。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

/// get_outline_node 工具定义
export const GET_OUTLINE_NODE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_outline_node',
    description: '根据节点 ID 获取单条大纲节点的详细信息（含描述、状态、目标字数、关联文档）。',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '大纲节点 ID',
        },
      },
      required: ['nodeId'],
    },
  },
}

/// create_outline_node 工具定义（写，待确认）
export const CREATE_OUTLINE_NODE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_outline_node',
    description:
      '在当前项目大纲中创建一个新节点。可指定父节点以建立层级。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '节点标题（必填）',
        },
        parentId: {
          type: 'string',
          description: '父节点 ID（可选，不填则为根节点）',
        },
        description: {
          type: 'string',
          description: '节点描述/写作要求（可选）',
        },
        targetWordCount: {
          type: 'integer',
          description: '目标字数（可选）',
        },
      },
      required: ['title'],
    },
  },
}

/// update_outline_node 工具定义（写，待确认）
export const UPDATE_OUTLINE_NODE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_outline_node',
    description:
      '更新已存在的大纲节点的标题、描述、状态或目标字数。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要更新的节点 ID',
        },
        title: {
          type: 'string',
          description: '新标题（可选）',
        },
        description: {
          type: 'string',
          description: '新描述（可选）',
        },
        status: {
          type: 'string',
          description: '新状态：draft（草稿）/ writing（写作中）/ completed（已完成）/ archived（已归档）',
        },
        targetWordCount: {
          type: 'integer',
          description: '新目标字数（可选）',
        },
      },
      required: ['nodeId'],
    },
  },
}

/// create_outline_nodes_from_markdown 工具定义（写，待确认）
export const CREATE_OUTLINE_NODES_FROM_MARKDOWN_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_outline_nodes_from_markdown',
    description:
      '从 Markdown 文本批量创建大纲节点。生成大纲时请使用清晰的层级结构：# 表示顶层，## 表示第二层，### 表示第三层；也可以在标题下用缩进列表（- / * / +）表示子级。严禁所有节点使用同一层级。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: '大纲 Markdown 文本（必填）。推荐格式：\n# 卷一\n## 第一章\n- 第一节\n  - 第一小节\n- 第二节\n\n# 卷二\n## 第三章',
        },
        replaceExisting: {
          type: 'boolean',
          description: '是否替换现有大纲节点（可选，默认 false）。当前仅支持 false，即追加到现有大纲。',
        },
      },
      required: ['markdown'],
    },
  },
}

/// delete_outline_node 工具定义（写，待确认）
export const DELETE_OUTLINE_NODE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'delete_outline_node',
    description:
      '删除大纲节点（软删除）。操作不会立即执行，会生成"待确认操作"由用户确认后落地。删除父节点不会级联删除子节点。',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要删除的节点 ID',
        },
      },
      required: ['nodeId'],
    },
  },
}

/// 大纲工具定义列表
export const OUTLINE_TOOLS: ToolDefinition[] = [
  LIST_OUTLINE_NODES_TOOL,
  GET_OUTLINE_NODE_TOOL,
  CREATE_OUTLINE_NODE_TOOL,
  CREATE_OUTLINE_NODES_FROM_MARKDOWN_TOOL,
  UPDATE_OUTLINE_NODE_TOOL,
  DELETE_OUTLINE_NODE_TOOL,
]

/// 构造大纲工具执行器
export function createOutlineToolExecutors(
  projectId: string,
  collector?: PendingActionCollector,
): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>()

  // list_outline_nodes（读）
  executors.set('list_outline_nodes', async () => {
    const result = await getOutline(projectId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    const { outline, nodes } = result.data
    return JSON.stringify({
      outlineId: outline.id,
      nodes: nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        title: n.title,
        description: n.description,
        sortOrder: n.sortOrder,
        depth: n.depth,
        status: n.status,
        targetWordCount: n.targetWordCount,
        linkedDocumentId: n.linkedDocumentId,
      })),
      total: nodes.length,
    })
  })

  // get_outline_node（读）
  executors.set('get_outline_node', async (args) => {
    const nodeId = readNonEmptyString(args, 'nodeId')
    if (!nodeId) {
      return errorResult('nodeId 不能为空')
    }

    const result = await getOutline(projectId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    const node = result.data.nodes.find((n) => n.id === nodeId)
    if (!node) {
      return errorResult('未找到对应的大纲节点')
    }

    return JSON.stringify({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      description: node.description,
      sortOrder: node.sortOrder,
      depth: node.depth,
      status: node.status,
      targetWordCount: node.targetWordCount,
      linkedDocumentId: node.linkedDocumentId,
      createdAt: node.createdAt,
    })
  })

  // create_outline_node（写，待确认）
  executors.set('create_outline_node', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const title = readNonEmptyString(args, 'title')
    if (!title) return errorResult('title 不能为空')

    const parentId = readString(args, 'parentId')
    const description = readString(args, 'description')
    const targetWordCountRaw = args.targetWordCount
    const targetWordCount =
      typeof targetWordCountRaw === 'number' && Number.isFinite(targetWordCountRaw) && targetWordCountRaw > 0
        ? targetWordCountRaw
        : undefined

    const summary = `创建大纲节点「${title}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'create_outline_node',
        args: {
          projectId,
          title,
          parentId: parentId ?? null,
          description: description ?? undefined,
          targetWordCount,
        },
        summary,
      }),
    )
  })

  // update_outline_node（写，待确认）
  executors.set('update_outline_node', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const nodeId = readNonEmptyString(args, 'nodeId')
    if (!nodeId) return errorResult('nodeId 不能为空')

    const title = readString(args, 'title')
    const description = readString(args, 'description')
    const status = readString(args, 'status')
    const targetWordCountRaw = args.targetWordCount
    const targetWordCount =
      typeof targetWordCountRaw === 'number' && Number.isFinite(targetWordCountRaw) && targetWordCountRaw > 0
        ? targetWordCountRaw
        : undefined

    if (!title && !description && !status && targetWordCount === undefined) {
      return errorResult('至少需要提供 title / description / status / targetWordCount 之一')
    }

    const summary = `更新大纲节点「${nodeId}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'update_outline_node',
        args: {
          nodeId,
          title: title ?? undefined,
          description: description ?? undefined,
          status: status ?? undefined,
          targetWordCount,
        },
        summary,
      }),
    )
  })

  // create_outline_nodes_from_markdown（写，待确认）
  executors.set('create_outline_nodes_from_markdown', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const markdown = readNonEmptyString(args, 'markdown')
    if (!markdown) return errorResult('markdown 不能为空')

    const replaceExistingRaw = args.replaceExisting
    const replaceExisting =
      typeof replaceExistingRaw === 'boolean' ? replaceExistingRaw : false

    const summary = '从 Markdown 批量创建大纲节点'
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'create_outline_nodes_from_markdown',
        args: {
          projectId,
          markdown,
          replaceExisting,
        },
        summary,
      }),
    )
  })

  // delete_outline_node（写，待确认）
  executors.set('delete_outline_node', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const nodeId = readNonEmptyString(args, 'nodeId')
    if (!nodeId) return errorResult('nodeId 不能为空')

    const summary = `删除大纲节点「${nodeId}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'delete_outline_node',
        args: { nodeId },
        summary,
      }),
    )
  })

  return executors
}
