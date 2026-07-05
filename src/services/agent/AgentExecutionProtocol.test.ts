import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@/types'
import {
  buildAgentExecutionProtocol,
  buildAvailableToolsSection,
} from './AgentExecutionProtocol'

function tool(name: string, description: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties: {} },
    },
  }
}

describe('AgentExecutionProtocol', () => {
  it('生成统一执行协议并包含任务类型与工具清单', () => {
    const protocol = buildAgentExecutionProtocol({
      tools: [
        tool('list_documents', '列出当前项目文档'),
        tool('create_document', '创建文档，生成待确认操作'),
      ],
      taskType: 'answer_question',
      boundObjectType: 'project',
    })

    expect(protocol).toContain('识别真实意图')
    expect(protocol).toContain('加载可用工具')
    expect(protocol).toContain('制定执行计划')
    expect(protocol).toContain('按计划完成任务')
    expect(protocol).toContain('当前任务类型：answer_question')
    expect(protocol).toContain('list_documents（查询）')
    expect(protocol).toContain('create_document（待确认写入）')
  })

  it('工具摘要按查询与待确认写入分类', () => {
    const summary = buildAvailableToolsSection([
      tool('get_document', '获取文档详情'),
      tool('append_document_content', '追加正文，生成待确认操作'),
    ])

    expect(summary).toContain('get_document（查询）')
    expect(summary).toContain('append_document_content（待确认写入）')
  })
})
