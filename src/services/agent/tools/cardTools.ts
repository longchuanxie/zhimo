// 卡片工具集
// 为 Agent 提供卡片的查询与写操作能力
//
// 工具列表（5 个）：
// - list_cards（读）：列出项目卡片
// - search_cards（读）：按关键词搜索卡片
// - create_card（写）：创建卡片（待确认）
// - update_card（写）：更新卡片（待确认）
// - update_card_status（写）：更新卡片状态（待确认）

import type { ToolDefinition, ToolExecutor } from '@/types'
import { listCards } from '@/services/card/CardService'
import type { PendingActionCollector } from './pendingActionCollector'
import {
  collectPending,
  errorResult,
  readNonEmptyString,
  readNumber,
  readString,
  readStringArray,
} from './toolHelpers'

/// list_cards 工具定义
export const LIST_CARDS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_cards',
    description:
      '列出当前项目的所有卡片（含标题、类型、状态、摘要）。可按状态过滤。',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            '状态过滤：pending（待确认）/ confirmed（已确认）/ deprecated（已废弃）/ conflict（有冲突）/ forbidden（禁止使用）',
        },
      },
    },
  },
}

/// search_cards 工具定义
export const SEARCH_CARDS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_cards',
    description:
      '按关键词搜索卡片（在标题、内容、摘要中匹配）。可按类型过滤。仅返回非软删除的卡片。',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '搜索关键词列表',
        },
        type: {
          type: 'string',
          description: '卡片类型过滤（如 note / quote / ai_generated 等）',
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

/// create_card 工具定义（写，待确认）
export const CREATE_CARD_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_card',
    description:
      '在当前项目中创建一张新卡片。用于沉淀对话中产生的笔记、引用、设定等。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '卡片标题（必填）',
        },
        content: {
          type: 'string',
          description: '卡片内容（必填）',
        },
        type: {
          type: 'string',
          description: '卡片类型（如 note / quote / ai_generated 等，默认 note）',
        },
        summary: {
          type: 'string',
          description: '卡片摘要（可选）',
        },
        aiUsageAllowed: {
          type: 'boolean',
          description: '是否允许 AI 使用（默认 true）',
        },
      },
      required: ['title', 'content'],
    },
  },
}

/// update_card 工具定义（写，待确认）
export const UPDATE_CARD_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_card',
    description:
      '更新已存在卡片的标题、内容或摘要。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: '要更新的卡片 ID',
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
      required: ['cardId'],
    },
  },
}

/// update_card_status 工具定义（写，待确认）
export const UPDATE_CARD_STATUS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_card_status',
    description:
      '更新卡片状态。操作不会立即执行，会生成"待确认操作"由用户确认后落地。',
    parameters: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: '要更新的卡片 ID',
        },
        status: {
          type: 'string',
          description:
            '目标状态：pending（待确认）/ confirmed（已确认）/ deprecated（已废弃）/ conflict（有冲突）/ forbidden（禁止使用）',
        },
      },
      required: ['cardId', 'status'],
    },
  },
}

/// 卡片工具定义列表
export const CARD_TOOLS: ToolDefinition[] = [
  LIST_CARDS_TOOL,
  SEARCH_CARDS_TOOL,
  CREATE_CARD_TOOL,
  UPDATE_CARD_TOOL,
  UPDATE_CARD_STATUS_TOOL,
]

/// 构造卡片工具执行器
export function createCardToolExecutors(
  projectId: string,
  collector?: PendingActionCollector,
): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>()

  // list_cards（读）
  executors.set('list_cards', async (args) => {
    const status = readString(args, 'status') as
      | 'pending'
      | 'confirmed'
      | 'deprecated'
      | 'conflict'
      | 'forbidden'
      | undefined

    const result = await listCards(projectId, status)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    return JSON.stringify({
      cards: result.data.map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        summary: c.summary,
        aiUsageAllowed: c.aiUsageAllowed,
        createdAt: c.createdAt,
      })),
      total: result.data.length,
    })
  })

  // search_cards（读）
  executors.set('search_cards', async (args) => {
    const keywords = readStringArray(args, 'keywords') ?? []
    const type = readString(args, 'type')
    const limitRaw = readNumber(args, 'limit')
    const limit =
      limitRaw !== null && limitRaw > 0 ? Math.min(limitRaw, 20) : 5

    if (keywords.length === 0) {
      return errorResult('keywords 不能为空')
    }

    const result = await listCards(projectId)
    if (!result.ok) {
      return errorResult(result.error.message)
    }

    let items = result.data
    if (type) {
      items = items.filter((c) => c.type === type)
    }

    const lowerKeywords = keywords.map((k) => k.toLowerCase())
    const matched = items
      .filter((c) =>
        lowerKeywords.some(
          (kw) =>
            c.title.toLowerCase().includes(kw) ||
            c.content.toLowerCase().includes(kw) ||
            (c.summary ?? '').toLowerCase().includes(kw),
        ),
      )
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        summary: c.summary,
        content: c.content,
      }))

    return JSON.stringify({ items: matched, total: matched.length })
  })

  // create_card（写，待确认）
  executors.set('create_card', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const title = readNonEmptyString(args, 'title')
    const content = readNonEmptyString(args, 'content')
    if (!title) return errorResult('title 不能为空')
    if (!content) return errorResult('content 不能为空')

    const type = readString(args, 'type') ?? 'note'
    const summary = readString(args, 'summary')
    const aiUsageAllowedRaw = args.aiUsageAllowed
    const aiUsageAllowed =
      typeof aiUsageAllowedRaw === 'boolean' ? aiUsageAllowedRaw : true

    const summaryText = `创建卡片「${title}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'create_card',
        args: {
          projectId,
          title,
          content,
          type,
          summary: summary ?? undefined,
          aiUsageAllowed,
        },
        summary: summaryText,
      }),
    )
  })

  // update_card（写，待确认）
  executors.set('update_card', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const cardId = readNonEmptyString(args, 'cardId')
    if (!cardId) return errorResult('cardId 不能为空')

    const title = readString(args, 'title')
    const content = readString(args, 'content')
    const summary = readString(args, 'summary')

    if (!title && !content && !summary) {
      return errorResult('至少需要提供 title / content / summary 之一')
    }

    const summaryText = `更新卡片「${cardId}」`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'update_card',
        args: {
          cardId,
          title: title ?? undefined,
          content: content ?? undefined,
          summary: summary ?? undefined,
        },
        summary: summaryText,
      }),
    )
  })

  // update_card_status（写，待确认）
  executors.set('update_card_status', async (args) => {
    if (!collector) {
      return errorResult('写工具未配置 collector')
    }

    const cardId = readNonEmptyString(args, 'cardId')
    const status = readString(args, 'status')

    if (!cardId) return errorResult('cardId 不能为空')
    if (!status) return errorResult('status 不能为空')

    const validStatuses = ['pending', 'confirmed', 'deprecated', 'conflict', 'forbidden']
    if (!validStatuses.includes(status)) {
      return errorResult(`status 必须是 ${validStatuses.join(' / ')} 之一`)
    }

    const summaryText = `将卡片「${cardId}」状态改为 ${status}`
    return JSON.stringify(
      collectPending(collector, {
        toolName: 'update_card_status',
        args: { cardId, status: status as 'pending' | 'confirmed' | 'deprecated' | 'conflict' | 'forbidden' },
        summary: summaryText,
      }),
    )
  })

  return executors
}
