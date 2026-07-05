// 统一图标组件
// 封装 Heroicons，统一尺寸和样式
// 对应文档：02_UX_UI_原型与规范/03_前端图标规范_v0.2.md

import type { ComponentType, SVGProps } from 'react'

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<IconSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-11 w-11',
}

type AppIconProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  size?: IconSize
  className?: string
}

export function AppIcon({ icon: Icon, size = 'md', className = '' }: AppIconProps) {
  return <Icon className={`${SIZE_CLASS[size]} ${className}`} aria-hidden="true" />
}
