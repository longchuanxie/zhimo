// 助手快捷动作
// 对应任务：DEV-076
// 提供常用任务的一键触发入口
//
// 设计说明：
// - 快捷动作对应 AgentTaskType
// - 点击后预填指令模板到输入框
// - 用户可在此基础上编辑后发送

import {
  PencilSquareIcon,
  ArrowsPointingOutIcon,
  DocumentTextIcon,
  MagnifyingGlassCircleIcon,
  ListBulletIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { AppIcon } from '@/components/foundation/AppIcon'
import type { AgentTaskType } from '@/types'

type QuickAction = {
  taskType: AgentTaskType
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /// 指令模板（{selection} 会被当前选区替换）
  template: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    taskType: 'rewrite',
    label: '改写',
    icon: PencilSquareIcon,
    template: '请改写当前选区，保留原意并根据项目风格规则调整表达。',
  },
  {
    taskType: 'expand',
    label: '扩写',
    icon: ArrowsPointingOutIcon,
    template: '请基于本次参考内容扩展当前文本，保持文档语气，不虚构案例和数据。',
  },
  {
    taskType: 'summarize',
    label: '摘要',
    icon: DocumentTextIcon,
    template: '请为当前选区生成一段简明摘要。',
  },
  {
    taskType: 'check_source',
    label: '检查来源',
    icon: MagnifyingGlassCircleIcon,
    template: '请检查当前段落是否有缺少来源支撑的判断，并给出可参考的资料或卡片。',
  },
  {
    taskType: 'generate_outline',
    label: '生成大纲',
    icon: ListBulletIcon,
    template: '请基于项目目标和已有资料生成分层大纲，每个节点说明写作目标。',
  },
  {
    taskType: 'generate_card',
    label: '生成卡片',
    icon: Squares2X2Icon,
    template: '请从当前选区中提取结构化的知识卡片。',
  },
]

type AgentQuickActionsProps = {
  /// 是否有选区（影响快捷动作可用性）
  hasSelection: boolean
  /// 点击快捷动作
  onAction: (action: QuickAction) => void
}

export function AgentQuickActions({
  hasSelection,
  onAction,
}: AgentQuickActionsProps) {
  return (
    <div className="px-3 py-2 border-t border-line">
      <div className="text-xs font-semibold text-muted mb-1.5">快捷动作</div>
      <div className="grid grid-cols-3 gap-1">
        {QUICK_ACTIONS.map((action) => {
          // 改写/扩写/摘要/检查来源 需要选区
          const needsSelection = [
            'rewrite',
            'expand',
            'summarize',
            'check_source',
          ].includes(action.taskType)
          const disabled = needsSelection && !hasSelection

          return (
            <button
              key={action.taskType}
              type="button"
              className={`flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs transition-colors ${
                disabled
                  ? 'text-subtle cursor-not-allowed'
                  : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
              onClick={() => !disabled && onAction(action)}
              disabled={disabled}
              title={
                disabled
                  ? '请先在文档中选中文本'
                  : action.label
              }
            >
              <AppIcon icon={action.icon} size="sm" />
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type { QuickAction }
