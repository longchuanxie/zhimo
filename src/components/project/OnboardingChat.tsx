// 项目 AI 引导创建对话组件
// 职责单一：渲染对话消息列表、输入框、快捷选项按钮
// 不直接调用模型或 Service，仅通过 props 与页面通信

import { useRef, useEffect } from 'react'
import { PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'

export type ChatMessage = {
  id: string
  role: 'agent' | 'user'
  content: string
  hint?: string
}

type OnboardingChatProps = {
  /// 消息列表
  messages: ChatMessage[]
  /// 当前输入值
  input: string
  /// 输入变更
  onInputChange: (value: string) => void
  /// 发送（可选传入覆盖文本，用于快捷选项）
  onSend: (overrideText?: string) => void
  /// 是否正在等待模型响应
  loading: boolean
  /// 当前节点可用的快捷选项
  quickOptions?: string[]
  /// 点击快捷选项（直接传入选项文本）
  onQuickOption?: (option: string) => void
  /// 输入框占位提示
  placeholder?: string
  /// 是否禁用输入（最终确认节点等）
  disabled?: boolean
}

export function OnboardingChat({
  messages,
  input,
  onInputChange,
  onSend,
  loading,
  quickOptions,
  onQuickOption,
  placeholder = '输入消息...',
  disabled = false,
}: OnboardingChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !loading && !disabled) {
        onSend()
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 消息列表 */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'bg-brand text-white rounded-br-none'
                  : 'bg-surface border border-line rounded-bl-none'
              }`}
            >
              {message.content}
              {message.hint && (
                <p className="mt-2 text-xs opacity-75">{message.hint}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-line rounded-2xl rounded-bl-none px-4 py-3 text-sm text-muted">
              正在思考...
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* 快捷选项 */}
      {quickOptions && quickOptions.length > 0 && !disabled && (
        <div className="px-6 pb-3">
          <div className="flex flex-wrap gap-2">
            {quickOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="px-3 py-1.5 rounded-full bg-surface border border-line text-xs text-ink hover:bg-brand-soft hover:border-brand hover:text-brand transition-colors"
                onClick={() => onQuickOption?.(option)}
                disabled={loading || disabled}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-line p-4">
        <div className="flex items-end gap-2">
          <textarea
            className="input flex-1 min-h-[52px] max-h-[120px] resize-none text-sm py-3"
            placeholder={placeholder}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || loading}
            rows={1}
          />
          <button
            type="button"
            className="btn-primary px-3 py-3"
            onClick={() => onSend()}
            disabled={!input.trim() || loading || disabled}
          >
            <AppIcon icon={PaperAirplaneIcon} size="sm" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-subtle">Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  )
}
