// 智能助手输入区
// 从 AgentPanel 拆分，负责消息输入、任务模式切换、发送触发

import {
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useLayoutEffect, useRef } from 'react'
import { AppIcon } from '@/components/foundation/AppIcon'
import { StatusTag } from '@/components/foundation/StatusTag'
import type { AgentTaskType } from '@/types'

const INPUT_MIN_HEIGHT = 60
const INPUT_MAX_HEIGHT = 180

type AgentInputAreaProps = {
  /// 当前输入文本
  input: string
  /// 输入文本变更
  onInputChange: (value: string) => void
  /// 当前任务类型
  taskType: AgentTaskType
  /// 清除任务模式
  onClearTaskType: () => void
  /// 发送（触发上下文预览）
  onSend: () => void
  /// 是否正在发送
  sending: boolean
  /// 是否正在准备预览
  previewLoading: boolean
}

export function AgentInputArea({
  input,
  onInputChange,
  taskType,
  onClearTaskType,
  onSend,
  sending,
  previewLoading,
}: AgentInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = `${INPUT_MIN_HEIGHT}px`
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, INPUT_MIN_HEIGHT),
      INPUT_MAX_HEIGHT,
    )
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY =
      textarea.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [input])

  return (
    <div className="border-t border-line p-3">
      {taskType !== 'answer_question' && (
        <div className="mb-1.5 flex items-center gap-1">
          <StatusTag
            status="active"
            label="任务模式"
            color="purple"
          />
          <button
            type="button"
            className="btn-ghost px-1 py-0.5 text-xs"
            onClick={onClearTaskType}
          >
            <AppIcon icon={XMarkIcon} size="sm" />
            清除
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="input min-h-[60px] max-h-[180px] resize-none overflow-hidden text-sm"
        placeholder="输入消息或使用快捷动作..."
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (input.trim() && !sending && !previewLoading) {
              onSend()
            }
          }
        }}
        disabled={sending || previewLoading}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-subtle">
          Enter 发送 · Shift+Enter 换行
        </span>
        <button
          type="button"
          className="btn-primary px-3 py-1"
          onClick={() => onSend()}
          disabled={!input.trim() || sending || previewLoading}
        >
          <AppIcon icon={PaperAirplaneIcon} size="sm" />
          {previewLoading ? '准备中...' : '发送'}
        </button>
      </div>
    </div>
  )
}
