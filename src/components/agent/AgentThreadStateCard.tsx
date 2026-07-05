// Agent 多轮状态卡片
// 展示当前线程的工作目标、步骤和采纳/拒绝摘要，并提供继续上一轮入口。

import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import type { AgentThreadState } from '@/types'

type AgentThreadStateCardProps = {
  state: AgentThreadState | null
  onContinue: () => void
}

export function AgentThreadStateCard({
  state,
  onContinue,
}: AgentThreadStateCardProps) {
  if (!state || !hasVisibleState(state)) return null

  const acceptedCount = state.acceptedDecisions.length
  const rejectedCount = state.rejectedDirections.length

  return (
    <section className="border-b border-line bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-soft">
          <AppIcon
            icon={ChatBubbleLeftRightIcon}
            size="sm"
            className="text-brand"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">当前协作目标</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-ink">
                {state.currentGoal ?? '继续推进当前对话'}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost flex-shrink-0 px-2 py-1 text-xs text-brand hover:bg-brand-soft"
              onClick={onContinue}
            >
              继续
              <AppIcon icon={ArrowRightIcon} size="sm" />
            </button>
          </div>

          {state.currentStep && (
            <p className="mt-1 text-xs text-muted">{state.currentStep}</p>
          )}

          {(acceptedCount > 0 || rejectedCount > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {acceptedCount > 0 && (
                <StatePill
                  icon={CheckCircleIcon}
                  text={`已采纳 ${acceptedCount}`}
                  tone="brand"
                />
              )}
              {rejectedCount > 0 && (
                <StatePill
                  icon={XCircleIcon}
                  text={`已拒绝 ${rejectedCount}`}
                  tone="muted"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function StatePill({
  icon,
  text,
  tone,
}: {
  icon: typeof CheckCircleIcon
  text: string
  tone: 'brand' | 'muted'
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
        tone === 'brand'
          ? 'bg-brand-soft text-brand'
          : 'bg-surface-2 text-muted'
      }`}
    >
      <AppIcon icon={icon} size="sm" />
      {text}
    </span>
  )
}

function hasVisibleState(state: AgentThreadState): boolean {
  return Boolean(
    state.currentGoal ||
      state.currentStep ||
      state.acceptedDecisions.length > 0 ||
      state.rejectedDirections.length > 0,
  )
}
