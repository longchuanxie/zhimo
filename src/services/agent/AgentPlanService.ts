import type {
  AgentPlan,
  AgentTaskType,
  BoundObjectType,
  ToolDefinition,
} from '@/types'
import type { WritingIntentPreflight } from '@/services/agent/WritingIntentService'

type BuildAgentPlanInput = {
  userInstruction: string
  taskType: AgentTaskType
  boundObjectType?: BoundObjectType
  writingPreflight: WritingIntentPreflight
  tools: ToolDefinition[]
}

export function buildAgentPlan(input: BuildAgentPlanInput): AgentPlan {
  if (input.writingPreflight.kind === 'clarify') {
    return {
      intentKind: 'clarify',
      targetObjectType: 'document',
      targetObjectId: input.writingPreflight.document?.id,
      requiredTools: [],
      allowedTools: selectKnownTools(input.tools, [
        'list_outline_nodes',
        'list_documents',
        'get_document',
      ]),
      riskLevel: 'high',
      clarificationRequired: true,
      steps: [
        '识别用户想完成正文编写',
        '检查目标大纲和文档状态',
        '发现存在覆盖风险，先向用户澄清',
      ],
    }
  }

  if (input.writingPreflight.kind === 'proceed') {
    const requiredTool =
      input.writingPreflight.mode === 'create_document'
        ? 'create_document'
        : 'append_document_content'

    return {
      intentKind: 'write_document_body',
      targetObjectType: 'document',
      targetObjectId:
        input.writingPreflight.document?.id ?? input.writingPreflight.outlineNode.id,
      requiredTools: [requiredTool],
      allowedTools: selectKnownTools(input.tools, [
        'list_outline_nodes',
        'list_documents',
        'get_document',
        'create_document',
        'append_document_content',
      ]),
      riskLevel: 'medium',
      clarificationRequired: false,
      steps: [
        '确认用户要生成目标集数正文',
        '基于目标大纲生成可采纳正文',
        `调用 ${requiredTool} 生成待确认写入操作`,
      ],
    }
  }

  return {
    intentKind: inferDefaultIntentKind(input.taskType),
    targetObjectType: input.boundObjectType ?? 'project',
    requiredTools: [],
    allowedTools: input.tools.map((tool) => tool.function.name),
    riskLevel: 'low',
    clarificationRequired: false,
    steps: [
      '识别用户真实任务意图',
      '根据任务选择可用工具',
      '先查询项目状态，再生成可确认的结果',
    ],
  }
}

function inferDefaultIntentKind(taskType: AgentTaskType): AgentPlan['intentKind'] {
  switch (taskType) {
    case 'generate_outline':
      return 'create_outline'
    case 'generate_card':
      return 'manage_card'
    case 'rewrite':
      return 'rewrite_document'
    case 'expand':
      return 'continue_document'
    case 'format_text':
      return 'polish_document'
    default:
      return 'answer_question'
  }
}

function selectKnownTools(
  tools: ToolDefinition[],
  names: string[],
): string[] {
  const available = new Set(tools.map((tool) => tool.function.name))
  return names.filter((name) => available.has(name))
}
