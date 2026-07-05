// 知识库工具集
// 为 Agent 提供知识库的查询与写操作能力
//
// 工具列表（4 个）：
// - search_knowledge（读）：按关键词搜索已确认知识
// - get_knowledge（读）：获取单条知识详情
// - create_knowledge（写）：创建知识（待确认）
// - update_knowledge（写）：更新知识（待确认）
//
// 调用流程：
// 1. AgentService.sendMessage 在所有任务中注入 KNOWLEDGE_TOOLS
// 2. 模型决定是否调用工具
// 3. 读工具直接调 KnowledgeService，返回 JSON 给模型
// 4. 写工具校验参数后 collector.add(intent)，返回 {pending:true} 给模型
// 5. AgentService 持久化 pending actions，UI 展示供用户确认

import type { ToolDefinition, ToolExecutor } from '@/types'
import { listKnowledge, getKnowledge } from '@/services/knowledge/KnowledgeService'
import type { PendingActionCollector } from './pendingActionCollector'
import {
  collectPending,
  errorResult,
  readNonEmptyString,
  readString,
  readStringArray,
  readNumber,
} from './toolHelpers'

/// search_knowledge 工具定义
///
/// 让模型按关键词检索已确认的知识条目，用于回答用户问题前调研项目设定
export const SEARCH_KNOWLEDGE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_knowledge',
    description:
      '在当前项目知识库中按关键词搜索已确认的知识条目。用于回答用户问题前检索项目设定、角色、世界观、规则、情节等。仅返回已确认（confirmed）状态的知识。',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '搜索关键词列表，会在标题、内容、摘要中匹配',
        },
        type: {
          type: 'string',
          description:
            '知识类型过滤：character（角色）/ setting（设定）/ worldview（世界观）/ plot（情节）/ rule（规则）/ fact（事实）',
        },
        limit: {
          type: 'integer',
          description: '最大返回数量，默认 5',
          default: 5,
        },
      },
      required: ['keywords'],
    },
  },
}

/// get_knowledge 工具定义
export const GET_KNOWLEDGE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_knowledge',
    description: '根据知识 ID 获取单条知识的完整内容（含正文、摘要、置信度、状态）。',
    parameters: {
      type: 'object',
      properties: {
        knowledgeId: {
          type: 'string',
          description: '知识条目 ID',
        },
      },
      required: ['knowledgeId'],
    },
  },
}

/// create_knowledge 工具定义（写操作，待确认）
export const CREATE_KNOWLEDGE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_knowledge',
    description:
      '在当前项目中创建一条新的知识条目。用于沉淀对话中产生的事实、设定、规则等。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '知识标题（必填，简明概括）',
        },
        content: {
          type: 'string',
          description: '知识正文（必填，详细内容）',
        },
        type: {
          type: 'string',
          description:
            '知识类型：character（角色）/ setting（设定）/ worldview（世界观）/ plot（情节）/ rule（规则）/ fact（事实）/ ai_generated（AI 生成）',
        },
        summary: {
          type: 'string',
          description: '知识摘要（可选，默认取 content 前 100 字）',
        },
        confidence: {
          type: 'number',
          description: '置信度 0~1（可选，默认 0.7）',
        },
      },
      required: ['title', 'content', 'type'],
    },
  },
}

/// update_knowledge 工具定义（写操作，待确认）
export const UPDATE_KNOWLEDGE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_knowledge',
    description:
      '更新已存在的知识条目的标题、内容或摘要。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        knowledgeId: {
          type: 'string',
          description: '要更新的知识 ID',
        },
        title: {
          type: 'string',
          description: '新标题（可选）',
        },
        content: {
          type: 'string',
          description: '新内容（可选）',
        },
        summary: {
          type: 'string',
          description: '新摘要（可选）',
        },
      },
      required: ['knowledgeId'],
    },
  },
}

/// 知识库工具定义列表
export const KNOWLEDGE_TOOLS: ToolDefinition[] = [
  SEARCH_KNOWLEDGE_TOOL,
  GET_KNOWLEDGE_TOOL,
  CREATE_KNOWLEDGE_TOOL,
  UPDATE_KNOWLEDGE_TOOL,
]

/// 答题任务的可用工具列表（向后兼容，AgentService 旧 import 仍可用）
export const ANSWER_QUESTION_TOOLS = KNOWLEDGE_TOOLS

/// 构造知识库工具执行器
///
/// 闭包绑定 projectId 与 collector，返回工具名 → 执行器的映射
/// - 读工具执行器返回 JSON 字符串
/// - 写工具执行器收集 intent 后返回 {pending:true} JSON
export function createKnowledgeToolExecutors(
  projectId: string,
  collector?: PendingActionCollector,
): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>()

  // search_knowledge（读）
  executors.set('search_knowledge', async (args) => {
    const keywords = readStringArray(args, 'keywords') ?? []
    const type = readString(args, 'type') ?? undefined
    const limitRaw = readNumber(args, 'limit')
    const limit =
      limitRaw !== null && limitRaw > 0 ? Math.min(limitRaw, 20) : 5

    if (keywords.length === 0) {
      return errorResult('keywords 不能为空')
    }

    const result = await listKnowledge(projectId, 'confirmed')
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    let items = result.data
    if (type) {
      items = items.filter((k) => k.type === type)
    }

    const lowerKeywords = keywords.map((k) => k.toLowerCase())
    const matched = items
      .filter((k) =>
        lowerKeywords.some(
          (kw) =>
            k.title.toLowerCase().includes(kw) ||
            k.content.toLowerCase().includes(kw) ||
            (k.summary ?? '').toLowerCase().includes(kw),
        ),
      )
      .slice(0, limit)
      .map((k) => ({
        id: k.id,
        title: k.title,
        type: k.type,
        summary: k.summary,
        content: k.content,
        confidence: k.confidence,
      }))

    return JSON.stringify({ items: matched, total: matched.length })
  })

  // get_knowledge（读）
  executors.set('get_knowledge', async (args) => {
    const knowledgeId = readNonEmptyString(args, 'knowledgeId')
    if (!knowledgeId) {
      return errorResult('knowledgeId 不能为空')
    }

    const result = await getKnowledge(knowledgeId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    const k = result.data
    return JSON.stringify({
      id: k.id,
      title: k.title,
      type: k.type,
      content: k.content,
      summary: k.summary,
      confidence: k.confidence,
      status: k.status,
      aiUsageAllowed: k.aiUsageAllowed,
      createdAt: k.createdAt,
    })
  })

  // create_knowledge（写，待确认）
  executors.set('create_knowledge', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const title = readNonEmptyString(args, 'title')
    const content = readNonEmptyString(args, 'content')
    const type = readNonEmptyString(args, 'type')

    if (!title) return errorResult('title 不能为空')
    if (!content) return errorResult('content 不能为空')
    if (!type) return errorResult('type 不能为空')

    const summary = `创建知识「${title}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'create_knowledge',
        args: { projectId, title, content, type, summary: readString(args, 'summary') ?? undefined, confidence: readNumber(args, 'confidence') ?? undefined },
        summary,
      }),
    )
  })

  // update_knowledge（写，待确认）
  executors.set('update_knowledge', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const knowledgeId = readNonEmptyString(args, 'knowledgeId')
    if (!knowledgeId) return errorResult('knowledgeId 不能为空')

    const title = readString(args, 'title')
    const content = readString(args, 'content')
    const summaryText = readString(args, 'summary')

    if (!title && !content && !summaryText) {
      return errorResult('至少需要提供 title / content / summary 之一')
    }

    const summary = `更新知识「${knowledgeId}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'update_knowledge',
        args: { knowledgeId, title: title ?? undefined, content: content ?? undefined, summary: summaryText ?? undefined },
        summary,
      }),
    )
  })

  return executors
}
