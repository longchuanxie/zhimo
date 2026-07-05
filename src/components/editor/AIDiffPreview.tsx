// AI 修改对比预览
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §9
// MVP 阶段：占位组件，Phase 6 接入 Agent 后实现完整对比

import { useState } from 'react'
import { AppIcon } from '@/components/foundation/AppIcon'
import {
  CheckIcon,
  XMarkIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'
import type { AgentExplanation } from '@/types'

type AIDiffPreviewProps = {
  before: string
  after: string
  explanation?: AgentExplanation | null
  onAccept: () => void
  onReject: () => void
  onContinueEdit?: () => void
  onSaveAsCard?: () => void
  onSaveAsKnowledge?: () => void
}

export function AIDiffPreview({
  before,
  after,
  explanation,
  onAccept,
  onReject,
  onContinueEdit,
  onSaveAsCard,
  onSaveAsKnowledge,
}: AIDiffPreviewProps) {
  const [showExplanation, setShowExplanation] = useState(false)

  return (
    <div className="card p-5 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink">AI 修改建议</h3>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          为什么这样建议？
        </button>
      </div>

      {/* 对比区域 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 修改前 */}
        <div>
          <div className="text-xs font-semibold text-subtle mb-2">修改前</div>
          <div className="p-3 bg-danger-soft/50 border border-danger/20 rounded-md text-sm text-ink leading-relaxed">
            {before}
          </div>
        </div>

        {/* 修改后 */}
        <div>
          <div className="text-xs font-semibold text-subtle mb-2">修改后</div>
          <div className="p-3 bg-brand-soft/50 border border-brand/20 rounded-md text-sm text-ink leading-relaxed">
            {after}
          </div>
        </div>
      </div>

      {/* 解释区域 */}
      {showExplanation && explanation && (
        <div className="p-4 bg-surface-2 rounded-md space-y-2 text-sm">
          <div>
            <span className="font-semibold text-ink">任务理解：</span>
            <span className="text-muted">{explanation.taskUnderstanding}</span>
          </div>
          <div>
            <span className="font-semibold text-ink">参考内容：</span>
            <span className="text-muted">{explanation.referencedContext.join('、')}</span>
          </div>
          <div>
            <span className="font-semibold text-ink">主要判断：</span>
            <ul className="list-disc list-inside text-muted mt-1">
              {explanation.mainJudgements.map((j, i) => (
                <li key={i}>{j}</li>
              ))}
            </ul>
          </div>
          {explanation.uncertainties.length > 0 && (
            <div>
              <span className="font-semibold text-ink">不确定项：</span>
              <ul className="list-disc list-inside text-muted mt-1">
                {explanation.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={onAccept}>
          <AppIcon icon={CheckIcon} size="sm" />
          接受修改
        </button>
        <button type="button" className="btn-secondary" onClick={onReject}>
          <AppIcon icon={XMarkIcon} size="sm" />
          拒绝
        </button>
        {onContinueEdit && (
          <button type="button" className="btn-ghost" onClick={onContinueEdit}>
            <AppIcon icon={PencilSquareIcon} size="sm" />
            继续修改
          </button>
        )}
        {onSaveAsCard && (
          <button type="button" className="btn-ghost" onClick={onSaveAsCard}>
            <AppIcon icon={Squares2X2Icon} size="sm" />
            保存为卡片
          </button>
        )}
        {onSaveAsKnowledge && (
          <button type="button" className="btn-ghost" onClick={onSaveAsKnowledge}>
            <AppIcon icon={CircleStackIcon} size="sm" />
            保存为知识
          </button>
        )}
      </div>
    </div>
  )
}
