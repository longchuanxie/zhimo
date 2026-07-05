// 状态标签组件
// 根据状态枚举显示中文 + 对应颜色

import type { TagColor } from '@/constants/status'
import { getStatusColor } from '@/constants/status'

type StatusTagProps = {
  /// 状态枚举值（英文）
  status: string
  /// 状态中文标签（已映射）
  label: string
  /// 可选自定义颜色
  color?: TagColor
  /// 可选图标
  icon?: React.ReactNode
}

const COLOR_CLASS: Record<TagColor, string> = {
  default: 'tag-default',
  brand: 'tag-brand',
  accent: 'tag-accent',
  info: 'tag bg-info-soft border border-info/20 text-info',
  purple: 'tag bg-purple-soft border border-purple/20 text-purple',
  danger: 'tag-danger',
}

export function StatusTag({ status, label, color, icon }: StatusTagProps) {
  const tagColor = color ?? getStatusColor(status)
  return (
    <span className={COLOR_CLASS[tagColor]}>
      {icon}
      {label}
    </span>
  )
}
