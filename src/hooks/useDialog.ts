// 命令式弹框 Hook
// 提供异步 confirm/prompt API，替代散落在页面中的 window.confirm/prompt
//
// 使用方式：
//   const { confirm, prompt } = useDialog()
//   const ok = await confirm({ title: '删除', description: '确认？', danger: true })
//   const name = await prompt({ title: '输入名称', defaultValue: '默认' })

import { useDialogStore, type ConfirmOptions, type PromptOptions } from '@/stores/dialogStore'

export function useDialog() {
  const openConfirm = useDialogStore((s) => s.openConfirm)
  const openPrompt = useDialogStore((s) => s.openPrompt)

  return {
    confirm: (options: ConfirmOptions) => openConfirm(options),
    prompt: (options: PromptOptions) => openPrompt(options),
  }
}
