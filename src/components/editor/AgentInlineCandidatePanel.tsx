// 编辑器内 Agent 候选结果面板
// 展示由助手采纳产生的待确认正文操作，让用户在文档上下文中执行或放弃。

import {
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import type { AgentInlineCandidate } from '@/stores/appStore'

type AgentInlineCandidatePanelProps = {
  candidate: NonNullable<AgentInlineCandidate>
  processing?: boolean
  errorMessage?: string | null
  onApply: () => void
  onReject: () => void
  onDismiss: () => void
}

export function AgentInlineCandidatePanel({
  candidate,
  processing = false,
  errorMessage = null,
  onApply,
  onReject,
  onDismiss,
}: AgentInlineCandidatePanelProps) {
  const isReplace = candidate.mode === 'replace_selection'
  const applyLabel = isReplace ? '替换选区' : '插入到文末'
  const modeText = isReplace
    ? `将选区替换为助手建议（${candidate.selectedText?.length ?? 0} 字 -> ${candidate.content.length} 字）`
    : `将助手建议追加到当前文档（${candidate.content.length} 字）`

  return (
    <div className="absolute right-4 top-4 z-40 w-[360px] rounded-md border border-purple/30 bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <AppIcon
              icon={isReplace ? ArrowsRightLeftIcon : ArrowDownTrayIcon}
              size="sm"
              className="text-purple"
            />
            <h3 className="text-sm font-semibold text-ink">助手候选正文</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">{modeText}</p>
        </div>
        <button
          type="button"
          className="btn-ghost px-1 py-1 text-muted"
          onClick={onDismiss}
          disabled={processing}
          aria-label="关闭候选"
        >
          <AppIcon icon={XMarkIcon} size="sm" />
        </button>
      </div>

      <div className="max-h-[220px] overflow-auto px-3 py-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {candidate.content}
        </p>
      </div>

      {errorMessage && (
        <p className="border-t border-line px-3 py-2 text-xs text-danger">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <span className="truncate text-xs text-subtle">{candidate.summary}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-muted"
            onClick={onReject}
            disabled={processing}
          >
            放弃
          </button>
          <button
            type="button"
            className="btn-primary px-2.5 py-1 text-xs"
            onClick={onApply}
            disabled={processing}
          >
            <AppIcon icon={CheckIcon} size="sm" />
            {processing ? '执行中...' : applyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
