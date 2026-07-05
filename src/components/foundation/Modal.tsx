// 通用弹框组件
// 对应规范：AGENTS.md §3.3 组件可维护性要求
//
// 职责：
// - 提供统一的弹框容器（遮罩 + 居中卡片 + 关闭按钮）
// - 支持 ESC 键关闭
// - 支持点击遮罩关闭
// - 子组件通过 children 传入

import { useEffect, useState, type ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { AppIcon } from './AppIcon'

type ModalProps = {
  /// 标题
  title: string
  /// 是否打开
  open: boolean
  /// 关闭回调
  onClose: () => void
  /// 内容
  children: ReactNode
  /// 底部操作区（按钮等）
  footer?: ReactNode
  /// 最大宽度类名（默认 max-w-lg）
  maxWidthClass?: string
  /// 是否允许点击遮罩关闭（默认 true）
  closeOnOverlay?: boolean
}

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  closeOnOverlay = true,
}: ModalProps) {
  // ESC 键关闭
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        className={`card w-full ${maxWidthClass} flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line flex-shrink-0">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onClose}
            aria-label="关闭"
          >
            <AppIcon icon={XMarkIcon} size="sm" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="overflow-auto p-6">{children}</div>

        {/* 底部操作区 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 确认对话框 ============

type ConfirmDialogProps = {
  /// 是否打开
  open: boolean
  /// 标题
  title: string
  /// 描述
  description: string
  /// 确认按钮文字（默认"确认"）
  confirmLabel?: string
  /// 取消按钮文字（默认"取消"）
  cancelLabel?: string
  /// 确认按钮是否为危险操作（红色）
  danger?: boolean
  /// 确认回调
  onConfirm: () => void
  /// 取消/关闭回调
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink leading-relaxed">{description}</p>
    </Modal>
  )
}

// ============ 提示对话框（替代 window.alert）============

type AlertDialogProps = {
  open: boolean
  title: string
  message: string
  onClose: () => void
}

export function AlertDialog({ open, title, message, onClose }: AlertDialogProps) {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          知道了
        </button>
      }
    >
      <p className="text-sm text-ink leading-relaxed whitespace-pre-line">
        {message}
      </p>
    </Modal>
  )
}

// ============ 输入对话框（替代 window.prompt）============

type PromptDialogProps = {
  open: boolean
  title: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export function PromptDialog({
  open,
  title,
  defaultValue = '',
  placeholder,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)

  // open 变化时重置为 defaultValue
  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const handleConfirm = () => {
    onConfirm(value)
    onClose()
  }

  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <input
        type="text"
        className="input w-full"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
        }}
        autoFocus
      />
    </Modal>
  )
}
