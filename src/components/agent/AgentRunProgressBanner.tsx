// 助手运行进度提示
// 用于外部对象命令自动提交时，给用户连续的状态反馈。
import { ArrowPathIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'

type AgentRunProgressBannerProps = {
  previewLoading: boolean
  sending: boolean
}

export function AgentRunProgressBanner({
  previewLoading,
  sending,
}: AgentRunProgressBannerProps) {
  if (!previewLoading && !sending) return null

  const title = sending ? '正在发送给助手' : '正在准备参考内容'
  const description = sending
    ? '已创建本次上下文快照，助手正在基于当前对象生成回复。'
    : '正在整理本次任务需要参考的资料、卡片、大纲和知识。'

  return (
    <div className="mx-3 mt-2 rounded-md border border-brand/20 bg-brand-soft px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface text-brand">
          <AppIcon
            icon={sending ? SparklesIcon : ArrowPathIcon}
            size="sm"
            className={previewLoading ? 'animate-spin' : undefined}
          />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </div>
    </div>
  )
}
