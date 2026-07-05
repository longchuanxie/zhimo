// 全局弹框宿主组件
// 在 AppShell 根布局挂载，渲染 ConfirmDialog / PromptDialog 全局实例
// 配合 useDialog Hook 提供命令式弹框 API

import { ConfirmDialog, PromptDialog } from '@/components/foundation/Modal'
import { useDialogStore } from '@/stores/dialogStore'

export function GlobalDialogHost() {
  const confirmDialog = useDialogStore((s) => s.confirmDialog)
  const closeConfirm = useDialogStore((s) => s.closeConfirm)
  const promptDialog = useDialogStore((s) => s.promptDialog)
  const closePrompt = useDialogStore((s) => s.closePrompt)

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.options.title}
        description={confirmDialog.options.description}
        confirmLabel={confirmDialog.options.confirmLabel}
        cancelLabel={confirmDialog.options.cancelLabel}
        danger={confirmDialog.options.danger}
        onConfirm={() => closeConfirm(true)}
        onClose={() => closeConfirm(false)}
      />
      <PromptDialog
        open={promptDialog.open}
        title={promptDialog.options.title}
        defaultValue={promptDialog.options.defaultValue}
        placeholder={promptDialog.options.placeholder}
        confirmLabel={promptDialog.options.confirmLabel}
        cancelLabel={promptDialog.options.cancelLabel}
        onConfirm={(value) => closePrompt(value)}
        onClose={() => closePrompt(null)}
      />
    </>
  )
}
