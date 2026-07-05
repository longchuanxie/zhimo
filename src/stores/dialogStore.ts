// 全局对话框状态管理
// 提供命令式 API（confirm/prompt），通过 Promise 异步等待用户操作
// 配合 GlobalDialogHost 渲染全局弹框实例，替代散落在页面中的 window.confirm/prompt
//
// 使用方式：
//   const { confirm, prompt } = useDialog()
//   const ok = await confirm({ title: '确认删除', description: '此操作不可撤销', danger: true })
//   if (ok) { ... }
//
// 架构约束（AGENTS.md §3.2）：禁止在页面中直接使用 window.confirm/prompt/alert

import { create } from 'zustand'

// ============ 类型定义 ============

export type ConfirmOptions = {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export type PromptOptions = {
  title: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmDialogState = {
  open: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}

type PromptDialogState = {
  open: boolean
  options: PromptOptions
  resolve: ((value: string | null) => void) | null
}

type DialogState = {
  confirmDialog: ConfirmDialogState
  promptDialog: PromptDialogState
  openConfirm: (options: ConfirmOptions) => Promise<boolean>
  closeConfirm: (result: boolean) => void
  openPrompt: (options: PromptOptions) => Promise<string | null>
  closePrompt: (result: string | null) => void
}

// ============ 实现 ============

const initialConfirmState: ConfirmDialogState = {
  open: false,
  options: { title: '', description: '' },
  resolve: null,
}

const initialPromptState: PromptDialogState = {
  open: false,
  options: { title: '' },
  resolve: null,
}

export const useDialogStore = create<DialogState>((set, get) => ({
  confirmDialog: initialConfirmState,
  promptDialog: initialPromptState,

  openConfirm: (options) => {
    return new Promise<boolean>((resolve) => {
      set({
        confirmDialog: { open: true, options, resolve },
      })
    })
  },

  closeConfirm: (result) => {
    const { resolve } = get().confirmDialog
    resolve?.(result)
    set({ confirmDialog: initialConfirmState })
  },

  openPrompt: (options) => {
    return new Promise<string | null>((resolve) => {
      set({
        promptDialog: { open: true, options, resolve },
      })
    })
  },

  closePrompt: (result) => {
    const { resolve } = get().promptDialog
    resolve?.(result)
    set({ promptDialog: initialPromptState })
  },
}))
