// 应用顶栏组件
// 包含品牌标识、全局导航、全局操作

import {
  BookOpenIcon,
  Cog6ToothIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { useAppStore } from '@/stores/appStore'

export function TopBar() {
  const toggleSettings = useAppStore((s) => s.toggleSettingsPanel)
  const toggleTaskCenter = useAppStore((s) => s.toggleTaskCenter)

  return (
    <header className="flex items-center justify-between h-14 px-5 bg-surface/80 backdrop-blur border-b border-line">
      {/* 品牌标识 */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-dark shadow-soft">
          <AppIcon icon={BookOpenIcon} size="sm" className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink leading-tight">知墨</h1>
          <p className="text-xs text-subtle leading-tight">本地优先 · 中文写作</p>
        </div>
      </div>

      {/* 全局操作 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost"
          onClick={toggleTaskCenter}
          aria-label="任务中心"
          title="任务中心"
        >
          <AppIcon icon={RectangleStackIcon} size="sm" />
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={toggleSettings}
          aria-label="设置"
          title="设置"
        >
          <AppIcon icon={Cog6ToothIcon} size="sm" />
        </button>
      </div>
    </header>
  )
}
