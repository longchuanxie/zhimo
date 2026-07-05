// Toast 通知容器
// 对应任务：DEV-091
//
// 职责：渲染全局通知队列，固定在右上角
// 通过 toastStore 管理通知状态

import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { useToastStore } from '@/stores/toastStore'
import type { ToastType } from '@/stores/toastStore'

const TOAST_ICON: Record<ToastType, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon,
}

const TOAST_STYLE: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: 'bg-success-soft border-success/20', text: 'text-success', icon: 'text-success' },
  error: { bg: 'bg-danger-soft border-danger/20', text: 'text-danger', icon: 'text-danger' },
  info: { bg: 'bg-info-soft border-info/20', text: 'text-info', icon: 'text-info' },
  warning: { bg: 'bg-accent-soft border-accent/20', text: 'text-accent', icon: 'text-accent' },
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const style = TOAST_STYLE[toast.type]
        const Icon = TOAST_ICON[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 px-4 py-3 rounded-md border shadow-md ${style.bg} animate-slide-in`}
          >
            <AppIcon icon={Icon} size="sm" className={`${style.icon} flex-shrink-0 mt-0.5`} />
            <p className={`text-sm ${style.text} flex-1`}>{toast.message}</p>
            <button
              type="button"
              className="flex-shrink-0 text-subtle hover:text-ink"
              onClick={() => dismiss(toast.id)}
              aria-label="关闭"
            >
              <AppIcon icon={XMarkIcon} size="sm" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
