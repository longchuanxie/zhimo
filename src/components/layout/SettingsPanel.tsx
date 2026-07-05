// 设置面板（右侧抽屉）
// 职责：提供全局设置入口（模型设置、应用信息等）
// 显示控制：通过 appStore.settingsPanelOpen 全局开关

import { useNavigate } from 'react-router-dom'
import {
  Cog6ToothIcon,
  XMarkIcon,
  CpuChipIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { useAppStore } from '@/stores/appStore'

type SettingItem = {
  key: string
  label: string
  description: string
  icon: typeof CpuChipIcon
  path?: string
}

const SETTING_ITEMS: SettingItem[] = [
  {
    key: 'models',
    label: '模型设置',
    description: '配置 AI 服务商、API Key 与任务模型',
    icon: CpuChipIcon,
    path: '/settings/models',
  },
  {
    key: 'about',
    label: '关于应用',
    description: '版本信息与使用说明',
    icon: InformationCircleIcon,
  },
]

export function SettingsPanel() {
  const settingsPanelOpen = useAppStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useAppStore((s) => s.setSettingsPanelOpen)
  const navigate = useNavigate()

  if (!settingsPanelOpen) {
    return null
  }

  const handleSelect = (item: SettingItem) => {
    if (item.path) {
      navigate(item.path)
      setSettingsPanelOpen(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30">
      {/* 点击遮罩关闭 */}
      <div
        className="absolute inset-0"
        onClick={() => setSettingsPanelOpen(false)}
      />

      {/* 面板 */}
      <aside className="relative w-[340px] bg-surface border-l border-line flex flex-col shadow-xl">
        {/* 头部 */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-soft">
            <AppIcon icon={Cog6ToothIcon} size="sm" className="text-brand" />
          </div>
          <h2 className="text-sm font-bold text-ink flex-1">设置</h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={() => setSettingsPanelOpen(false)}
            aria-label="关闭"
          >
            <AppIcon icon={XMarkIcon} size="sm" />
          </button>
        </div>

        {/* 设置项列表 */}
        <div className="flex-1 overflow-auto p-3">
          <div className="space-y-2">
            {SETTING_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="w-full flex items-start gap-3 p-3 rounded-md border border-line hover:bg-surface-2 transition-colors text-left"
                onClick={() => handleSelect(item)}
              >
                <AppIcon
                  icon={item.icon}
                  size="sm"
                  className="text-muted mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{item.label}</div>
                  <div className="text-xs text-muted mt-0.5">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-4 py-3 border-t border-line">
          <p className="text-xs text-subtle text-center">知墨 · MVP</p>
        </div>
      </aside>
    </div>
  )
}
