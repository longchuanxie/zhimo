// Toast 通知状态管理
// 对应任务：DEV-091
//
// 职责：管理全局通知队列，提供 show/dismiss API
// 通知类型：success / error / info / warning

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  /// 自动关闭时长（毫秒），0 表示不自动关闭
  duration: number
}

type ToastState = {
  toasts: ToastItem[]
  /// 显示通知
  showToast: (input: {
    type: ToastType
    message: string
    duration?: number
  }) => string
  /// 关闭通知
  dismissToast: (id: string) => void
  /// 清空所有通知
  clearToasts: () => void
}

let toastIdCounter = 0

function generateToastId(): string {
  toastIdCounter += 1
  return `toast-${Date.now()}-${toastIdCounter}`
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: ({ type, message, duration }) => {
    const id = generateToastId()
    const finalDuration = duration ?? (type === 'error' ? 0 : 3000)

    const toast: ToastItem = {
      id,
      type,
      message,
      duration: finalDuration,
    }

    set((state) => ({ toasts: [...state.toasts, toast] }))

    // 自动关闭
    if (finalDuration > 0) {
      setTimeout(() => {
        get().dismissToast(id)
      }, finalDuration)
    }

    return id
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  clearToasts: () => set({ toasts: [] }),
}))

// ============ 便捷方法（非 Hook，可在 Service 中使用）============

export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().showToast({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().showToast({ type: 'error', message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().showToast({ type: 'info', message, duration }),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().showToast({ type: 'warning', message, duration }),
}
