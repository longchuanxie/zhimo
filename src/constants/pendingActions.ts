// 待确认操作状态与工具名中文映射
// 对应表：agent_pending_actions
// 集中维护，避免散落到组件（AGENTS.md §3.6）

import type { PendingActionStatus } from '@/types'

/// 待确认操作状态中文映射
export const PENDING_ACTION_STATUS_LABEL: Record<PendingActionStatus, string> = {
  pending: '待确认',
  applied: '已执行',
  rejected: '已拒绝',
}

/// 触发待确认操作的工具名中文映射
///
/// key 为工具名（toolName），value 为 UI 显示的中文名称
export const PENDING_ACTION_TOOL_LABEL: Record<string, string> = {
  create_outline_node: '创建大纲节点',
  update_outline_node: '更新大纲节点',
  delete_outline_node: '删除大纲节点',
  create_document: '创建文档',
  append_document_content: '追加正文内容',
  create_card: '创建卡片',
  update_card: '更新卡片',
  update_card_status: '更新卡片状态',
  create_knowledge: '创建知识',
  update_knowledge: '更新知识',
}

/// 根据工具名获取中文标签，未知工具名回退到工具名本身
export function getPendingActionToolLabel(toolName: string): string {
  return PENDING_ACTION_TOOL_LABEL[toolName] ?? toolName
}
