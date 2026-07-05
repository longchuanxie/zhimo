import { describe, expect, it } from 'vitest'
import type { AgentPlan, ToolDefinition } from '@/types'
import { selectToolsForAgentPlan } from './AgentToolPolicyService'

function tool(name: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
    },
  }
}

describe('AgentToolPolicyService', () => {
  it('按 AgentPlan 裁剪工具清单', () => {
    const plan: AgentPlan = {
      intentKind: 'write_document_body',
      targetObjectType: 'document',
      requiredTools: ['create_document'],
      allowedTools: ['list_documents', 'create_document'],
      riskLevel: 'medium',
      clarificationRequired: false,
      steps: [],
    }

    const selected = selectToolsForAgentPlan(plan, [
      tool('list_documents'),
      tool('create_document'),
      tool('create_card'),
    ])

    expect(selected.map((item) => item.function.name)).toEqual([
      'list_documents',
      'create_document',
    ])
  })
})
