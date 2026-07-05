import { describe, expect, it } from 'vitest'
import type { AgentPlan, PendingActionIntent } from '@/types'
import {
  buildMissingRequiredToolRetryInstruction,
  validateRequiredTools,
} from './AgentToolRequirementService'

const plan: AgentPlan = {
  intentKind: 'write_document_body',
  targetObjectType: 'document',
  requiredTools: ['append_document_content'],
  allowedTools: ['append_document_content'],
  riskLevel: 'medium',
  clarificationRequired: false,
  steps: [],
}

describe('AgentToolRequirementService', () => {
  it('检测缺失的必需写入工具', () => {
    const result = validateRequiredTools({
      plan,
      pendingIntents: [],
    })

    expect(result.ok).toBe(false)
    expect(result.missingTools).toEqual(['append_document_content'])
  })

  it('必需写入工具已收集时通过校验', () => {
    const pendingIntents: PendingActionIntent[] = [{
      toolName: 'append_document_content',
      args: { documentId: 'doc-1', content: '正文' },
      summary: '追加正文',
    }]

    const result = validateRequiredTools({
      plan,
      pendingIntents,
    })

    expect(result.ok).toBe(true)
  })

  it('生成缺失工具重试指令', () => {
    const instruction = buildMissingRequiredToolRetryInstruction({
      plan,
      missingTools: ['append_document_content'],
    })

    expect(instruction).toContain('append_document_content')
    expect(instruction).toContain('调用缺失的写入工具')
  })
})
