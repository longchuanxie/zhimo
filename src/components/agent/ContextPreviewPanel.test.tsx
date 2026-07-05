// ContextPreviewPanel 回归测试
// 验证轻量任务默认折叠，高影响任务显式确认。

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextPreviewPanel } from './ContextPreviewPanel'
import type { AgentTaskType, ContextEntry, ContextPreview } from '@/types'

function makeEntry(overrides: Partial<ContextEntry>): ContextEntry {
  return {
    kind: 'user_instruction',
    refId: null,
    title: '用户指令',
    preview: '请处理当前内容',
    tokenEstimate: 20,
    required: true,
    excluded: false,
    ...overrides,
  }
}

function makePreview(taskType: AgentTaskType, entries: ContextEntry[]): ContextPreview {
  return {
    projectId: 'project-1',
    threadId: 'thread-1',
    taskType,
    userInstruction: '请处理当前内容',
    selectedText: null,
    boundObjectType: 'project',
    boundObjectId: 'project-1',
    contextScope: 'related',
    entries,
    totalTokenEstimate: entries.reduce((sum, entry) => sum + entry.tokenEstimate, 0),
    projectRulesSnapshot: null,
  }
}

const baseEntries = [
  makeEntry({
    kind: 'user_instruction',
    title: '用户指令',
    preview: '请改写当前选区',
    tokenEstimate: 20,
  }),
  makeEntry({
    kind: 'selected_text',
    title: '当前选区',
    preview: '这是一段选中文本',
    tokenEstimate: 80,
  }),
  makeEntry({
    kind: 'project_rules',
    title: '项目风格规则',
    preview: '中文优先，保持克制',
    tokenEstimate: 50,
  }),
]

describe('ContextPreviewPanel', () => {
  it('轻量任务默认只显示摘要，详情折叠', () => {
    render(
      <ContextPreviewPanel
        preview={makePreview('rewrite', baseEntries)}
        onCreateContextPack={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('轻量任务：已自动精简参考范围')).toBeInTheDocument()
    expect(screen.getByText('查看详情')).toBeInTheDocument()
    expect(screen.queryByText('必选（不可排除）')).not.toBeInTheDocument()
    expect(screen.getByText(/用户指令 1/)).toBeInTheDocument()
  })

  it('点击查看详情后显示必选项与 token 进度', () => {
    render(
      <ContextPreviewPanel
        preview={makePreview('summarize', baseEntries)}
        onCreateContextPack={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('查看详情'))

    expect(screen.getByText('必选（不可排除）')).toBeInTheDocument()
    expect(screen.getByText(/3% · 3 项/)).toBeInTheDocument()
  })

  it('高影响任务默认展示风险提示和详情', () => {
    const entries = [
      ...baseEntries,
      makeEntry({
        kind: 'source',
        refId: 'source-1',
        title: '资料 A',
        preview: '资料摘要',
        tokenEstimate: 200,
        required: false,
      }),
    ]

    render(
      <ContextPreviewPanel
        preview={makePreview('generate_outline', entries)}
        onCreateContextPack={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('高影响任务：发送前请确认参考范围')).toBeInTheDocument()
    expect(screen.getByText('此任务可能创建或调整大纲结构，请先确认参考资料和已有大纲范围。')).toBeInTheDocument()
    expect(screen.getByText('必选（不可排除）')).toBeInTheDocument()
    expect(screen.getByText('可选')).toBeInTheDocument()
  })

  it('排除可选项后确认发送时带上 refId', () => {
    const onCreateContextPack = vi.fn()
    const entries = [
      ...baseEntries,
      makeEntry({
        kind: 'source',
        refId: 'source-1',
        title: '资料 A',
        preview: '资料摘要',
        tokenEstimate: 200,
        required: false,
      }),
    ]

    render(
      <ContextPreviewPanel
        preview={makePreview('check_source', entries)}
        onCreateContextPack={onCreateContextPack}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('排除'))
    fireEvent.click(screen.getByText(/确认并发送/))

    expect(onCreateContextPack).toHaveBeenCalledWith(['source-1'])
  })
})
