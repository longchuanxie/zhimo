// 助手消息项
// 对应任务：DEV-075 / DEV-077 / DEV-078
// 展示单条消息，含操作条与"为什么这样建议"解释区
//
// 设计说明：
// - 用户消息：右对齐，简洁展示
// - 助手消息：左对齐，含操作条与解释区
// - 解释区可折叠，默认展开
// - 操作条：采纳/拒绝/保存为卡片/保存为知识

import { useState } from 'react'
import {
  UserIcon,
  SparklesIcon,
  CheckIcon,
  XMarkIcon,
  Squares2X2Icon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { StatusTag } from '@/components/foundation/StatusTag'
import { PendingActionList } from '@/components/agent/PendingActionList'
import type { AgentMessage, AdoptionStatus, AgentExplanation } from '@/types'

type AgentMessageItemProps = {
  message: AgentMessage
  onAdopt?: (message: AgentMessage) => void
  onReject?: (message: AgentMessage) => void
  onSaveAsCard?: (message: AgentMessage) => void
  onSaveAsKnowledge?: (message: AgentMessage) => void
}

const ADOPTION_STATUS_LABEL: Record<AdoptionStatus, string> = {
  not_applied: '待处理',
  applied: '已采纳',
  rejected: '已拒绝',
  saved_as_card: '已存为卡片',
  saved_as_knowledge: '已存为知识',
}

export function AgentMessageItem({
  message,
  onAdopt,
  onReject,
  onSaveAsCard,
  onSaveAsKnowledge,
}: AgentMessageItemProps) {
  const isUser = message.role === 'user'
  const [explanationOpen, setExplanationOpen] = useState(true)

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[85%] rounded-lg bg-brand text-white px-3 py-2">
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  // 助手消息
  const isHandled = message.adoptionStatus !== 'not_applied'

  return (
    <div className="flex gap-2 px-4 py-2">
      {/* 头像 */}
      <div className="flex-shrink-0 mt-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-soft">
          <AppIcon icon={SparklesIcon} size="sm" className="text-purple" />
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* 消息正文 */}
        <div className="rounded-lg bg-surface border border-line px-3 py-2">
          <p className="text-sm text-ink whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>

        {/* 解释区：为什么这样建议 */}
        {message.explanation && (
          <div className="rounded-md bg-purple-soft/40 border border-purple/20">
            <button
              type="button"
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left"
              onClick={() => setExplanationOpen((v) => !v)}
            >
              <AppIcon
                icon={explanationOpen ? ChevronDownIcon : ChevronRightIcon}
                size="sm"
                className="text-purple"
              />
              <span className="text-xs font-semibold text-purple">
                为什么这样建议？
              </span>
            </button>
            {explanationOpen && (
              <ExplanationContent explanation={message.explanation} />
            )}
          </div>
        )}

        {/* 待确认操作列表（写工具收集） */}
        <PendingActionList messageId={message.id} />

        {/* 操作条 */}
        {!isHandled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-brand hover:bg-brand-soft"
              onClick={() => onAdopt?.(message)}
            >
              <AppIcon icon={CheckIcon} size="sm" />
              采纳
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-muted hover:bg-surface-2"
              onClick={() => onReject?.(message)}
            >
              <AppIcon icon={XMarkIcon} size="sm" />
              拒绝
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-muted hover:bg-surface-2"
              onClick={() => onSaveAsCard?.(message)}
            >
              <AppIcon icon={Squares2X2Icon} size="sm" />
              存为卡片
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-muted hover:bg-surface-2"
              onClick={() => onSaveAsKnowledge?.(message)}
            >
              <AppIcon icon={BookOpenIcon} size="sm" />
              存为知识
            </button>
          </div>
        )}

        {/* 采纳状态 */}
        {isHandled && (
          <div>
            <StatusTag
              status={message.adoptionStatus}
              label={ADOPTION_STATUS_LABEL[message.adoptionStatus]}
              color={
                message.adoptionStatus === 'rejected' ? 'default' : 'brand'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 子组件：解释区内容 ============

function ExplanationContent({
  explanation,
}: {
  explanation: AgentExplanation
}) {
  return (
    <div className="px-3 pb-2 space-y-2 text-xs">
      {explanation.taskUnderstanding && (
        <ExplanationField label="理解的任务">
          {explanation.taskUnderstanding}
        </ExplanationField>
      )}
      {explanation.referencedContext.length > 0 && (
        <ExplanationField label="参考的内容">
          <ul className="list-disc list-inside space-y-0.5">
            {explanation.referencedContext.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </ExplanationField>
      )}
      {explanation.mainJudgements.length > 0 && (
        <ExplanationField label="主要判断">
          <ul className="list-disc list-inside space-y-0.5">
            {explanation.mainJudgements.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </ExplanationField>
      )}
      {explanation.revisionReasons.length > 0 && (
        <ExplanationField label="修改理由">
          <ul className="list-disc list-inside space-y-0.5">
            {explanation.revisionReasons.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </ExplanationField>
      )}
      {explanation.uncertainties.length > 0 && (
        <ExplanationField label="不确定的地方">
          <ul className="list-disc list-inside space-y-0.5 text-accent">
            {explanation.uncertainties.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </ExplanationField>
      )}
    </div>
  )
}

function ExplanationField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="font-semibold text-purple mb-0.5">{label}</div>
      <div className="text-ink leading-relaxed">{children}</div>
    </div>
  )
}

// 用户消息头像（预留）
export function UserMessageAvatar() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft">
      <AppIcon icon={UserIcon} size="sm" className="text-brand" />
    </div>
  )
}
