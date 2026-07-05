// 工具注册表
// 聚合所有模块的工具定义与执行器工厂，供 AgentService 统一注入
//
// 设计说明：
// - ALL_PROJECT_TOOLS：所有模块的工具定义列表，传给模型的 tools 参数
// - createAllToolExecutors：聚合所有模块的执行器，闭包绑定 projectId 与 collector
// - 新增模块工具时，在此处导入并合并即可，无需改动 AgentService

import type { ToolDefinition, ToolExecutor } from '@/types'
import type { PendingActionCollector } from './pendingActionCollector'
import { OUTLINE_TOOLS, createOutlineToolExecutors } from './outlineTools'
import { DOCUMENT_TOOLS, createDocumentToolExecutors } from './documentTools'
import { CARD_TOOLS, createCardToolExecutors } from './cardTools'
import { KNOWLEDGE_TOOLS, createKnowledgeToolExecutors } from './knowledgeTools'

/// 所有模块的工具定义列表
///
/// 传给模型 callModel 的 tools 参数，模型可自行决定调用哪些
export const ALL_PROJECT_TOOLS: ToolDefinition[] = [
  ...OUTLINE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...CARD_TOOLS,
  ...KNOWLEDGE_TOOLS,
]

/// 构造所有模块的工具执行器
///
/// 闭包绑定 projectId 与 collector，返回工具名 → 执行器的映射
/// 读工具直接执行 Service；写工具收集 intent 到 collector
///
/// @param projectId 当前项目 ID
/// @param collector 待确认操作收集器（写工具依赖）
export function createAllToolExecutors(
  projectId: string,
  collector: PendingActionCollector,
): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>()

  // 合并各模块执行器
  const moduleFactories = [
    createOutlineToolExecutors,
    createDocumentToolExecutors,
    createCardToolExecutors,
    createKnowledgeToolExecutors,
  ]

  for (const factory of moduleFactories) {
    const moduleExecutors = factory(projectId, collector)
    for (const [name, executor] of moduleExecutors) {
      executors.set(name, executor)
    }
  }

  return executors
}
