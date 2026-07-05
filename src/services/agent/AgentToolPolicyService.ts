import type { AgentPlan, ToolDefinition } from '@/types'

export function selectToolsForAgentPlan(
  plan: AgentPlan,
  tools: ToolDefinition[],
): ToolDefinition[] {
  if (plan.allowedTools.length === 0) return tools

  const allowed = new Set(plan.allowedTools)
  const selected = tools.filter((tool) => allowed.has(tool.function.name))
  return selected.length > 0 ? selected : tools
}

export function getToolNames(tools: ToolDefinition[]): string[] {
  return tools.map((tool) => tool.function.name)
}
