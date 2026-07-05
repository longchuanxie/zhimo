import type { AgentPlan, PendingActionIntent } from '@/types'

export type ToolRequirementValidation = {
  ok: boolean
  missingTools: string[]
}

export function validateRequiredTools(input: {
  plan: AgentPlan
  pendingIntents: PendingActionIntent[]
}): ToolRequirementValidation {
  if (input.plan.requiredTools.length === 0) {
    return { ok: true, missingTools: [] }
  }

  const collected = new Set(input.pendingIntents.map((intent) => intent.toolName))
  const missingTools = input.plan.requiredTools.filter(
    (toolName) => !collected.has(toolName),
  )
  return {
    ok: missingTools.length === 0,
    missingTools,
  }
}

export function buildMissingRequiredToolRetryInstruction(input: {
  plan: AgentPlan
  missingTools: string[]
}): string {
  return [
    '【系统校验】',
    `本轮任务计划要求必须调用工具：${input.plan.requiredTools.join(', ')}`,
    `但当前还缺少：${input.missingTools.join(', ')}`,
    '请不要只输出正文或说明。请根据用户任务继续执行计划，并调用缺失的写入工具生成待确认操作。',
    '如果主体回复是可采纳正文，主体只保留正文；计划、工具判断和风险写入 <explanation> JSON。',
  ].join('\n')
}

export function buildMissingRequiredToolErrorMessage(input: {
  missingTools: string[]
}): string {
  return `Agent 未按计划生成必要的待确认操作：${input.missingTools.join(', ')}。请重试或缩小任务范围。`
}
