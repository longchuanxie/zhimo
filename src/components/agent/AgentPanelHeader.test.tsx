import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AgentPanelHeader } from './AgentPanelHeader'

describe('AgentPanelHeader', () => {
  it('展示智能助手标题并触发刷新和新建对话', () => {
    const onRefresh = vi.fn()
    const onCreateThread = vi.fn()

    render(
      <AgentPanelHeader
        onRefresh={onRefresh}
        onCreateThread={onCreateThread}
      />,
    )

    expect(screen.getByText('智能助手')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('刷新'))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('新对话'))
    expect(onCreateThread).toHaveBeenCalledTimes(1)
  })
})
