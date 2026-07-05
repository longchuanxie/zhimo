// Agent 待确认操作类型定义
// 对应表：agent_pending_actions
// 用于支持 Agent 工具调用中的写操作"待确认"机制
//
// 设计说明：
// - Agent 调用写工具（如 create_outline_node）时不直接落库，
//   而是生成 PendingToolAction 持久化，由用户在 UI 上确认后才真正执行
// - 一条助手消息可关联多条待确认操作
// - status 流转：pending → applied / rejected

import type { EntityId, ISODateString } from './index'

/// 待确认操作状态
export type PendingActionStatus = 'pending' | 'applied' | 'rejected'

/// 待确认操作记录
///
/// 由 Agent 工具循环中收集，关联到触发它的助手消息
export interface PendingToolAction {
  id: EntityId
  /// 关联的助手消息 ID
  messageId: EntityId
  projectId: EntityId
  threadId: EntityId
  /// 触发此操作的工具名（如 create_outline_node）
  toolName: string
  /// 工具调用参数（JSON 反序列化后的对象）
  args: Record<string, unknown>
  /// 中文摘要，供 UI 展示（如 "创建大纲节点「第一章」"）
  summary: string
  status: PendingActionStatus
  createdAt: ISODateString
  /// 应用/拒绝时间，pending 状态为 null
  appliedAt: ISODateString | null
}

/// 工具循环中收集的写操作意图（持久化前的中间形态）
///
/// 由写工具执行器调用 collector.add() 添加，
/// AgentService.sendMessage 完成后调用 collector.drain() 批量持久化
export interface PendingActionIntent {
  toolName: string
  args: Record<string, unknown>
  /// 中文摘要
  summary: string
}
