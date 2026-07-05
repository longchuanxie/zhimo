import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentInputArea } from './AgentInputArea'

function renderInput(input: string) {
  return render(
    <AgentInputArea
      input={input}
      onInputChange={vi.fn()}
      taskType="answer_question"
      onClearTaskType={vi.fn()}
      onSend={vi.fn()}
      sending={false}
      previewLoading={false}
    />,
  )
}

describe('AgentInputArea', () => {
  it('auto expands the textarea with content and clamps at max height', () => {
    let scrollHeight = 84
    const { container, rerender } = renderInput('短消息')
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    rerender(
      <AgentInputArea
        input={'第一行\n第二行\n第三行'}
        onInputChange={vi.fn()}
        taskType="answer_question"
        onClearTaskType={vi.fn()}
        onSend={vi.fn()}
        sending={false}
        previewLoading={false}
      />,
    )
    expect(textarea.style.height).toBe('84px')
    expect(textarea.style.overflowY).toBe('hidden')

    scrollHeight = 240
    rerender(
      <AgentInputArea
        input={'很多内容\n'.repeat(20)}
        onInputChange={vi.fn()}
        taskType="answer_question"
        onClearTaskType={vi.fn()}
        onSend={vi.fn()}
        sending={false}
        previewLoading={false}
      />,
    )
    expect(textarea.style.height).toBe('180px')
    expect(textarea.style.overflowY).toBe('auto')
  })
})
