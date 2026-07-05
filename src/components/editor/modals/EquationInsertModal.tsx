// 公式插入弹框
// 对应任务：C.8 公式插入
//
// 职责：
// - 输入 LaTeX 源码 + 可选 label
// - 动态 import katex 实时预览（throwOnError: false，显示错误不崩溃）
// - 提交时调用 validateLatex 严格校验（throwOnError: true）
// - 调用 createEquation 创建公式记录 → insertEquationBlock 插入公式块
//
// 依赖：EquationService.createEquation / validateLatex、EquationBlock.insertEquationBlock 命令

import { useState, useEffect } from 'react'
import { CalculatorIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/foundation/Modal'
import { createEquation, validateLatex } from '@/services/equation/EquationService'
import { toast } from '@/stores/toastStore'
import type { Editor } from '@tiptap/react'

type Props = {
  editor: Editor | null
  documentId: string
  projectId: string
  open: boolean
  onClose: () => void
}

export function EquationInsertModal({
  editor,
  documentId,
  projectId,
  open,
  onClose,
}: Props) {
  const [latex, setLatex] = useState('')
  const [label, setLabel] = useState('')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // open 变化时重置表单
  useEffect(() => {
    if (open) {
      setLatex('')
      setLabel('')
      setPreviewHtml('')
      setPreviewError(null)
    }
  }, [open])

  // 实时预览：动态 import katex，throwOnError: false 避免崩溃
  useEffect(() => {
    if (!latex.trim()) {
      setPreviewHtml('')
      setPreviewError(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const katex = (await import('katex')).default
        const html = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: true,
        })
        if (!cancelled) {
          setPreviewHtml(html)
          setPreviewError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewHtml('')
          setPreviewError(e instanceof Error ? e.message : String(e))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [latex])

  const canSubmit = latex.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!editor || !canSubmit) return
    setSubmitting(true)
    try {
      // 1. 严格校验 LaTeX 语法
      const checkResult = await validateLatex(latex.trim())
      if (!checkResult.ok) {
        toast.error(`公式语法错误：${checkResult.error.message}`)
        return
      }

      // 2. 创建公式记录
      const result = await createEquation({
        projectId,
        documentId,
        latex: latex.trim(),
        label: label.trim() || null,
      })

      if (result.ok) {
        // 3. 插入公式块
        editor
          .chain()
          .focus()
          .insertEquationBlock({
            equationId: result.data.id,
            latex: result.data.latex,
            label: result.data.label,
          })
          .run()
        toast.success('公式已插入')
        onClose()
      } else {
        toast.error(`插入失败：${result.error.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="插入公式"
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-xl"
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
            {submitting ? '插入中...' : '插入公式'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted block mb-1">
            LaTeX 源码 <span className="text-danger">*</span>
          </label>
          <textarea
            className="input w-full min-h-[80px] resize-y font-mono text-sm"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder="如 E = mc^2 或 \int_0^1 x^2 dx"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">标签（可选）</label>
          <input
            type="text"
            className="input w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="如 eq:energy"
            maxLength={50}
          />
        </div>

        {/* 实时预览 */}
        <div>
          <label className="text-xs text-muted block mb-1">预览</label>
          <div className="border border-line rounded-md p-4 bg-surface-2/50 min-h-[80px] flex items-center justify-center">
            {!latex.trim() ? (
              <span className="text-sm text-subtle">输入 LaTeX 源码后此处显示预览</span>
            ) : previewError ? (
              <span className="text-sm text-danger">预览加载失败：{previewError}</span>
            ) : (
              <div
                className="equation-preview"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        </div>

        {/* 语法提示 */}
        <div className="flex items-start gap-2 p-2 bg-surface-2/50 rounded-md">
          <CalculatorIcon className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted">
            提交时将严格校验 LaTeX 语法。常用语法：上标 ^、下标 _、分数 \frac{}{}、求和 \sum、积分 \int、希腊字母 \alpha \beta \gamma。
          </p>
        </div>
      </div>
    </Modal>
  )
}
