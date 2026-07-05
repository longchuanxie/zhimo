import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentPanelErrorBanner } from './AgentPanelErrorBanner'

describe('AgentPanelErrorBanner', () => {
  it('显示错误码、错误信息和研发详情', () => {
    render(
      <AgentPanelErrorBanner
        error={{
          code: 'AGENT_CONTEXT_FAILED',
          message: '上下文创建失败',
          detail: 'token 超限',
        }}
      />,
    )

    expect(
      screen.getByText('[AGENT_CONTEXT_FAILED] 上下文创建失败 (token 超限)'),
    ).toBeInTheDocument()
  })

  it('没有错误时不渲染提示条', () => {
    const { container } = render(<AgentPanelErrorBanner error={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
