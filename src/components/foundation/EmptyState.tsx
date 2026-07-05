// 空状态组件
// 对应文档：02_UX_UI_原型与规范/02_空状态设计规范_v0.1_定稿.md
// 标准结构：图标 + 标题 + 说明 + 主按钮 + 次按钮 + 辅助提示

import type { ComponentType, SVGProps } from 'react'
import { AppIcon } from './AppIcon'

type ActionButton = {
  label: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  onClick: () => void
}

type EmptyStateProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
  primaryAction?: ActionButton
  secondaryAction?: ActionButton
  hint?: string
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  hint,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* 主图标 */}
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-xl bg-surface-2 border border-line">
        <AppIcon icon={icon} size="xl" className="text-brand" />
      </div>

      {/* 标题 */}
      <h3 className="text-lg font-bold text-ink mb-2">{title}</h3>

      {/* 说明 */}
      <p className="text-sm text-muted leading-relaxed max-w-md mb-6">{description}</p>

      {/* 行动按钮 */}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-3">
          {primaryAction && (
            <button
              type="button"
              className="btn-primary"
              onClick={primaryAction.onClick}
            >
              {primaryAction.icon && <AppIcon icon={primaryAction.icon} size="sm" />}
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="btn-secondary"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.icon && <AppIcon icon={secondaryAction.icon} size="sm" />}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      {/* 辅助提示 */}
      {hint && (
        <p className="mt-6 text-xs text-subtle max-w-sm leading-relaxed">{hint}</p>
      )}
    </div>
  )
}
