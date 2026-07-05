// 项目类型选项按钮
// 三选一(research/fiction/free_writing),供创建项目相关页面复用

import { PROJECT_TYPE_LABEL } from '@/constants/status'
import type { ProjectType } from '@/types'

export type TypeOptionProps = {
  type: ProjectType
  selected: boolean
  onClick: () => void
}

export function TypeOption({ type, selected, onClick }: TypeOptionProps) {
  return (
    <button
      type="button"
      className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
        selected
          ? 'border-brand bg-brand-soft text-brand'
          : 'border-line bg-surface text-muted hover:bg-surface-2'
      }`}
      onClick={onClick}
    >
      {PROJECT_TYPE_LABEL[type]}
    </button>
  )
}
