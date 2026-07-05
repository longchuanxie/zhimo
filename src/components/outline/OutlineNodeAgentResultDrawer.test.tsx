import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { OutlineNode } from '@/types'

vi.mock('@/components/agent/ObjectAgentResultPanel', () => ({
  ObjectAgentResultPanel: () => <div>助手成果列表</div>,
}))

const { OutlineNodeAgentResultDrawer } = await import('./OutlineNodeAgentResultDrawer')

function makeNode(overrides: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id: 'node-1',
    outlineId: 'outline-1',
    projectId: 'project-1',
    parentId: null,
    title: '第一章',
    description: null,
    sortOrder: 0,
    depth: 0,
    targetWordCount: 1200,
    currentWordCount: 300,
    status: 'draft',
    linkedDocumentId: 'doc-1',
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('OutlineNodeAgentResultDrawer', () => {
  it('展示节点信息并触发操作回调', () => {
    const onClose = vi.fn()
    const onDraftNode = vi.fn()
    const onOpenDocument = vi.fn()
    const node = makeNode()

    render(
      <OutlineNodeAgentResultDrawer
        projectId="project-1"
        node={node}
        onClose={onClose}
        onDraftNode={onDraftNode}
        onOpenDocument={onOpenDocument}
      />,
    )

    expect(screen.getByText('节点助手成果')).toBeInTheDocument()
    expect(screen.getAllByText('第一章').length).toBeGreaterThan(0)
    expect(screen.getByText('当前字数：300')).toBeInTheDocument()
    expect(screen.getByText('目标：1200')).toBeInTheDocument()
    expect(screen.getByText('状态：草稿')).toBeInTheDocument()
    expect(screen.getByText('助手成果列表')).toBeInTheDocument()

    fireEvent.click(screen.getByText('打开文档'))
    expect(onOpenDocument).toHaveBeenCalledWith('doc-1')

    fireEvent.click(screen.getByText('让助手起草'))
    expect(onDraftNode).toHaveBeenCalledWith(node)

    fireEvent.click(screen.getByLabelText('关闭节点助手成果'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('起草触发后展示可见反馈', () => {
    render(
      <OutlineNodeAgentResultDrawer
        projectId="project-1"
        node={makeNode()}
        isDrafting
        onClose={vi.fn()}
        onDraftNode={vi.fn()}
      />,
    )

    expect(
      screen.getByText('已发送给助手起草正文。请在助手面板查看生成过程，采纳后的结果会沉淀在这里。'),
    ).toBeInTheDocument()
  })

  it('非正文层级不展示起草入口', () => {
    const onDraftNode = vi.fn()

    render(
      <OutlineNodeAgentResultDrawer
        projectId="project-1"
        node={makeNode()}
        canDraft={false}
        onClose={vi.fn()}
        onDraftNode={onDraftNode}
      />,
    )

    expect(screen.queryByText('让助手起草')).not.toBeInTheDocument()
    expect(screen.getByText('仅正文层级可起草')).toBeInTheDocument()
  })
})
