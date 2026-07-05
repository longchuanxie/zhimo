import type { AgentTaskType, BoundObjectType, ToolDefinition } from '@/types'

export function buildAgentExecutionProtocol(input: {
  tools: ToolDefinition[]
  taskType: AgentTaskType
  boundObjectType?: BoundObjectType
}): string {
  return [
    '【统一任务执行协议】',
    '你必须按以下顺序处理每一轮用户请求：',
    '1. 识别真实意图：先判断用户到底要问答、生成正文、改写、创建/更新项目对象、检查资料，还是需要澄清。',
    '2. 加载可用工具：阅读本轮可用工具清单，判断哪些工具能查询现状，哪些工具会生成待确认操作。',
    '3. 制定执行计划：基于任务意图、当前上下文和可用工具，形成简短计划；需要查询现状时先调用查询工具，需要写入时再调用写工具。',
    '4. 按计划完成任务：能直接完成的直接给出结果；需要项目状态的先查工具；涉及写入的只能生成待确认操作，不能声称已经落库；信息不足或存在覆盖风险时先向用户澄清。',
    '5. 计划记录位置：如果主体回复是可采纳正文，不要把计划写进主体；把意图、计划、工具判断和不确定点写入 <explanation> JSON 的对应字段。',
    `当前任务类型：${input.taskType}`,
    `当前绑定对象：${input.boundObjectType ?? '未绑定'}`,
    buildAvailableToolsSection(input.tools),
  ].join('\n')
}

export function buildAvailableToolsSection(tools: ToolDefinition[]): string {
  const lines = tools.map((tool) => {
    const name = tool.function.name
    const kind = inferToolKind(name, tool.function.description)
    return `- ${name}（${kind}）：${tool.function.description}`
  })

  return ['【本轮已加载工具】', ...lines].join('\n')
}

function inferToolKind(name: string, description: string): '查询' | '待确认写入' {
  if (
    description.includes('待确认') ||
    name.startsWith('create_') ||
    name.startsWith('update_') ||
    name.startsWith('delete_') ||
    name.startsWith('append_')
  ) {
    return '待确认写入'
  }
  return '查询'
}
