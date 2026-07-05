// 业务对象图标映射
// 集中维护所有业务对象对应的 Heroicons 图标
// 对应文档：02_UX_UI_原型与规范/03_前端图标规范_v0.2.md
// 统一使用 @heroicons/react/24/outline

import type { ComponentType, SVGProps } from 'react'
import {
  FolderIcon,
  DocumentTextIcon,
  ArchiveBoxIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CircleStackIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  CpuChipIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  PlusIcon,
  BookOpenIcon,
  PhotoIcon,
  CalculatorIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

/// 业务对象 → 图标映射
export const OBJECT_ICONS: Record<string, IconType> = {
  project: FolderIcon,
  document: DocumentTextIcon,
  source: ArchiveBoxIcon,
  sourceChunk: DocumentTextIcon,
  card: Squares2X2Icon,
  outline: ListBulletIcon,
  outlineNode: ListBulletIcon,
  knowledge: CircleStackIcon,
  agentThread: ChatBubbleLeftRightIcon,
  agentMessage: ChatBubbleLeftRightIcon,
  agentRun: SparklesIcon,
  contextPack: CircleStackIcon,
  modelProvider: CpuChipIcon,
  modelConfig: CpuChipIcon,
  exportTask: ArrowDownTrayIcon,
  task: Cog6ToothIcon,
  search: MagnifyingGlassIcon,
  error: ExclamationTriangleIcon,
  warning: ExclamationTriangleIcon,
  settings: Cog6ToothIcon,
  create: PlusIcon,
  ai: SparklesIcon,
  book: BookOpenIcon,
  reference: BookOpenIcon,
  citation: BookOpenIcon,
  figure: PhotoIcon,
  equation: CalculatorIcon,
  latex: CommandLineIcon,
}

/// 主导航图标
export const NAV_ICONS = {
  projectHome: FolderIcon,
  documents: DocumentTextIcon,
  sources: ArchiveBoxIcon,
  cards: Squares2X2Icon,
  outline: ListBulletIcon,
  knowledge: CircleStackIcon,
  agent: ChatBubbleLeftRightIcon,
  modelSettings: CpuChipIcon,
  export: ArrowDownTrayIcon,
  taskCenter: Cog6ToothIcon,
  settings: Cog6ToothIcon,
  references: BookOpenIcon,
} as const

/// 获取业务对象图标
export function getObjectIcon(key: string): IconType {
  return OBJECT_ICONS[key] ?? DocumentTextIcon
}
