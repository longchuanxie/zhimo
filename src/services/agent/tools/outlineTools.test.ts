// 大纲 Agent 工具单元测试
// 覆盖工具执行器对 PendingActionCollector 的收集行为

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PendingActionCollector } from './pendingActionCollector'
import { createOutlineToolExecutors } from './outlineTools'

// ============ mock OutlineService ============
const getOutlineMock = vi.fn()

vi.mock('@/services/outline/OutlineService', () => ({
  getOutline: (...args: unknown[]) => getOutlineMock(...(args as [])),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ============ 测试 ============

describe('createOutlineToolExecutors', () => {
  it('create_outline_nodes_from_markdown 收集待确认操作', async () => {
    const collector = new PendingActionCollector()
    const executors = createOutlineToolExecutors('p1', collector)
    const executor = executors.get('create_outline_nodes_from_markdown')
    expect(executor).toBeDefined()

    const markdown = '# 第一章\n## 第一节'
    const result = await executor!({ markdown })

    expect(collector.size).toBe(1)
    const intents = collector.drain()
    expect(intents[0]!.toolName).toBe('create_outline_nodes_from_markdown')
    expect(intents[0]!.args).toMatchObject({
      projectId: 'p1',
      markdown,
      replaceExisting: false,
    })
    expect(intents[0]!.summary).toContain('Markdown')

    // 执行器返回 JSON 字符串，内容包含收集的意图摘要
    expect(typeof result).toBe('string')
    expect(result).toContain('等待用户确认')
  })

  it('create_outline_nodes_from_markdown 无 collector 时报错', async () => {
    const executors = createOutlineToolExecutors('p1')
    const executor = executors.get('create_outline_nodes_from_markdown')
    expect(executor).toBeDefined()

    const result = await executor!({ markdown: '# 第一章' })
    expect(result).toContain('写工具未配置 collector')
  })

  it('create_outline_nodes_from_markdown 空 markdown 报错', async () => {
    const collector = new PendingActionCollector()
    const executors = createOutlineToolExecutors('p1', collector)
    const executor = executors.get('create_outline_nodes_from_markdown')

    const result = await executor!({ markdown: '' })
    expect(result).toContain('markdown 不能为空')
    expect(collector.size).toBe(0)
  })

  it('create_outline_node 保持原有单节点收集行为', async () => {
    const collector = new PendingActionCollector()
    const executors = createOutlineToolExecutors('p1', collector)
    const executor = executors.get('create_outline_node')
    expect(executor).toBeDefined()

    const result = await executor!({ title: '第一章' })

    expect(collector.size).toBe(1)
    const intents = collector.drain()
    expect(intents[0]!.toolName).toBe('create_outline_node')
    expect(intents[0]!.args).toMatchObject({
      projectId: 'p1',
      title: '第一章',
      parentId: null,
    })

    expect(typeof result).toBe('string')
  })
})
