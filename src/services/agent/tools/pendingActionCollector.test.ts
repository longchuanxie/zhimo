// PendingActionCollector 单元测试
// 覆盖 add / drain / size 的基本行为与复用语义

import { describe, it, expect } from 'vitest'
import { PendingActionCollector } from './pendingActionCollector'
import type { PendingActionIntent } from '@/types'

function makeIntent(overrides: Partial<PendingActionIntent> = {}): PendingActionIntent {
  return {
    toolName: 'create_outline_node',
    args: { title: '第一章' },
    summary: '创建大纲节点「第一章」',
    ...overrides,
  }
}

describe('PendingActionCollector', () => {
  it('初始状态 size 为 0', () => {
    const collector = new PendingActionCollector()
    expect(collector.size).toBe(0)
  })

  it('add 后 size 递增', () => {
    const collector = new PendingActionCollector()
    collector.add(makeIntent())
    expect(collector.size).toBe(1)
    collector.add(makeIntent({ toolName: 'create_card' }))
    expect(collector.size).toBe(2)
  })

  it('drain 返回全部意图并保持顺序', () => {
    const collector = new PendingActionCollector()
    const i1 = makeIntent({ summary: '意图1' })
    const i2 = makeIntent({ summary: '意图2' })
    collector.add(i1)
    collector.add(i2)

    const drained = collector.drain()
    expect(drained).toHaveLength(2)
    expect(drained[0]).toBe(i1)
    expect(drained[1]).toBe(i2)
  })

  it('drain 后 collector 重置为空，可复用', () => {
    const collector = new PendingActionCollector()
    collector.add(makeIntent())
    collector.drain()

    expect(collector.size).toBe(0)

    // 复用：再次 add 不受前一次 drain 影响
    collector.add(makeIntent({ summary: '新意图' }))
    expect(collector.size).toBe(1)
    const second = collector.drain()
    expect(second).toHaveLength(1)
    expect(second[0]!.summary).toBe('新意图')
  })

  it('drain 空收集器返回空数组', () => {
    const collector = new PendingActionCollector()
    expect(collector.drain()).toEqual([])
  })
})
