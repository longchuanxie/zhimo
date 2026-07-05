// 表单字段组件
// 提供统一的 label + 必填星号 + hint 布局,供创建项目相关页面复用

import type { ReactNode } from 'react'

export type FormFieldProps = {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}

export function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  )
}
