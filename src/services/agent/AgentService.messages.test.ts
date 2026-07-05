// AgentService 模型消息构造测试
// 覆盖 buildModelMessages 的消息顺序、历史对话插入、系统提示词内容

import { describe, it, expect } from 'vitest'
import { buildModelMessages } from './AgentService'
import type { ModelMessage } from '@/types'

describe('buildModelMessages', () => {
  it('系统提示词要求模型参考历史对话上下文', () => {
    const messages = buildModelMessages(
      '',
      '当前问题',
      [],
      null,
      'answer_question',
      'project',
    )

    const systemMessage = messages[0]
    expect(systemMessage?.role).toBe('system')
    expect(systemMessage?.content).toContain('本轮对话中之前的用户消息和助手回复')
    expect(systemMessage?.content).toContain('保持上下文连贯')
  })

  it('消息顺序为 system → 历史对话 → 当前用户指令', () => {
    const history: ModelMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，有什么可以帮你的？' },
    ]

    const messages = buildModelMessages(
      '',
      '我叫张三',
      history,
      null,
      'answer_question',
      'project',
    )

    expect(messages).toHaveLength(4)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!).toEqual(history[0])
    expect(messages[2]!).toEqual(history[1])
    expect(messages[3]!).toEqual({ role: 'user', content: '我叫张三' })
  })

  it('存在历史对话摘要时追加到系统提示', () => {
    const messages = buildModelMessages(
      '',
      '后续问题',
      [],
      '前文讨论了主角设定。',
      'answer_question',
      'project',
    )

    const systemContent = messages[0]!.content
    expect(systemContent).toContain('【历史对话摘要】')
    expect(systemContent).toContain('前文讨论了主角设定。')
  })

  it('存在本次参考内容时追加到系统提示', () => {
    const messages = buildModelMessages(
      '资料A：主角性格外向。',
      '基于资料分析',
      [],
      null,
      'answer_question',
      'project',
    )

    const systemContent = messages[0]!.content
    expect(systemContent).toContain('【本次参考内容】')
    expect(systemContent).toContain('资料A：主角性格外向。')
  })

  it('系统提示包含统一任务执行协议和已加载工具清单', () => {
    const messages = buildModelMessages(
      '',
      '接下来完成第2集正文编写',
      [],
      null,
      'answer_question',
      'project',
    )

    const systemContent = messages[0]!.content
    expect(systemContent).toContain('【统一任务执行协议】')
    expect(systemContent).toContain('识别真实意图')
    expect(systemContent).toContain('加载可用工具')
    expect(systemContent).toContain('制定执行计划')
    expect(systemContent).toContain('【本轮已加载工具】')
    expect(systemContent).toContain('list_outline_nodes')
    expect(systemContent).toContain('append_document_content')
  })
})
