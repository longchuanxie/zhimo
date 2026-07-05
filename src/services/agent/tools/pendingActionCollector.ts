// 待确认操作收集器
// 在 Agent 工具循环中收集写工具产生的"待确认操作"意图
//
// 调用流程：
// 1. AgentService.sendMessage 创建 collector 实例，传入 createAllToolExecutors
// 2. 写工具执行器校验参数后调用 collector.add(intent)，返回 {pending:true} 给模型
// 3. 工具循环结束后，AgentService 调用 collector.drain() 取出全部意图
// 4. 批量 insertPendingAction 持久化，关联到助手消息

import type { PendingActionIntent } from '@/types'

export class PendingActionCollector {
  private items: PendingActionIntent[] = []

  /// 添加一条待确认操作意图
  add(intent: PendingActionIntent): void {
    this.items.push(intent)
  }

  /// 取出全部意图并清空内部缓存
  ///
  /// 调用后 collector 重置为空，可复用于下一次 sendMessage
  drain(): PendingActionIntent[] {
    const drained = this.items
    this.items = []
    return drained
  }

  snapshot(): PendingActionIntent[] {
    return [...this.items]
  }

  /// 当前已收集的意图数量（用于测试与调试）
  get size(): number {
    return this.items.length
  }
}
