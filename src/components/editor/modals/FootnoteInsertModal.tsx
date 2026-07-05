// 脚注插入弹框
// 对应任务：C.10 脚注插入
//
// 职责：
// - 输入脚注内容（1-500 字）
// - 调用 Footnote.setFootnote 命令在选区插入脚注 mark
//
// 依赖：Footnote 扩展的 setFootnote 命令

import { useState, useEffect } from 'react'
import { Modal } from '@/components/foundation/Modal'
import { toast } from '@/stores/toastStore'
import type { Editor } from '@tiptap/react'

type Props = {
  editor: Editor | null
  open: boolean
  onClose: () => void
}

const MAX_LENGTH = 500

export function FootnoteInsertModal({ editor, open, onClose }: Props) {
  const [content, setContent] = useState('')
  const [footnoteId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (open) setContent('')
  }, [open])

  const canSubmit = content.trim().length > 0 && content.length <= MAX_LENGTH

  const handleSubmit = () => {
    if (!editor || !canSubmit) return
    editor
      .chain()
      .focus()
      .setFootnote({ footnoteId, content: content.trim() })
      .run()
    toast.success('脚注已插入')
    onClose()
  }

  return (
    <Modal
      title="插入脚注"
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            插入
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted block mb-1">
            脚注内容 <span className="text-danger">*</span>
          </label>
          <textarea
            className="input w-full min-h-[100px] resize-y"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入脚注内容（1-500 字）"
            maxLength={MAX_LENGTH}
            autoFocus
          />
          <p className="text-xs text-subtle mt-1 text-right">
            {content.length} / {MAX_LENGTH}
          </p>
        </div>
        <p className="text-xs text-muted">
          脚注将在导出时生成文末脚注列表（LaTeX 使用 \footnote，DOCX 暂以文本形式标注）。
        </p>
      </div>
    </Modal>
  )
}
