import { describe, expect, it } from 'vitest'
import type { OutlineNode, ToolDefinition } from '@/types'
import { buildAgentPlan } from './AgentPlanService'

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

function outlineNode(): OutlineNode {
  return {
    id: 'node-2',
    projectId: 'proj-1',
    outlineId: 'outline-1',
    parentId: null,
    title: '第二集',
    description: null,
    status: 'draft',
    sortOrder: 2,
    depth: 1,
    linkedDocumentId: null,
    targetWordCount: 2000,
    currentWordCount: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }
}

describe('AgentPlanService', () => {
  it('为未创建文档的正文写作计划要求 create_document', () => {
    const plan = buildAgentPlan({
      userInstruction: '完成第2集正文编写',
      taskType: 'answer_question',
      boundObjectType: 'project',
      tools: [
        tool('list_documents'),
        tool('create_document'),
        tool('append_document_content'),
      ],
      writingPreflight: {
        kind: 'proceed',
        intent: { episodeNumber: 2, targetLabel: '第2集' },
        mode: 'create_document',
        outlineNode: outlineNode(),
        document: null,
        instructionAddon: '',
      },
    })

    expect(plan.intentKind).toBe('write_document_body')
    expect(plan.requiredTools).toEqual(['create_document'])
    expect(plan.allowedTools).toContain('create_document')
  })
})
