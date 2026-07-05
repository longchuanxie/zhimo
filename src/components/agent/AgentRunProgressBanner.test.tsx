import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentRunProgressBanner } from './AgentRunProgressBanner'

describe('AgentRunProgressBanner', () => {
  it('准备上下文时显示参考内容准备状态', () => {
    render(<AgentRunProgressBanner previewLoading={true} sending={false} />)

    expect(screen.getByText('正在准备参考内容')).toBeInTheDocument()
    expect(screen.getByText(/正在整理本次任务需要参考的资料/)).toBeInTheDocument()
  })

  it('发送时显示助手生成状态', () => {
    render(<AgentRunProgressBanner previewLoading={false} sending={true} />)

    expect(screen.getByText('正在发送给助手')).toBeInTheDocument()
    expect(screen.getByText(/已创建本次上下文快照/)).toBeInTheDocument()
  })

  it('空闲时不渲染', () => {
    const { container } = render(
      <AgentRunProgressBanner previewLoading={false} sending={false} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
