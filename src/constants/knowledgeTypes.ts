// 知识类型枚举与显示映射
// 集中维护知识类型，避免散落在页面中
//
// 类型覆盖小说创作场景核心要素：
// - character：角色（人物设定、关系、背景）
// - setting：设定（地点、组织、物品）
// - worldview：世界观（规则体系、历史背景）
// - plot：情节（事件、时间线）
// - rule：规则（写作规则、设定约束）
// - fact：事实（通用事实，无法归入上述类型时的兜底）

import type { ComponentType, SVGProps } from 'react'
import {
  UserIcon,
  MapPinIcon,
  GlobeAltIcon,
  BookOpenIcon,
  ScaleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'

export const KNOWLEDGE_TYPES = [
  'character',
  'setting',
  'worldview',
  'plot',
  'rule',
  'fact',
] as const

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

export const KNOWLEDGE_TYPE_LABEL: Record<KnowledgeType, string> = {
  character: '角色',
  setting: '设定',
  worldview: '世界观',
  plot: '情节',
  rule: '规则',
  fact: '事实',
}

export const KNOWLEDGE_TYPE_ICON: Record<
  KnowledgeType,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  character: UserIcon,
  setting: MapPinIcon,
  worldview: GlobeAltIcon,
  plot: BookOpenIcon,
  rule: ScaleIcon,
  fact: ClipboardDocumentListIcon,
}

/// 旧数据兼容：未识别类型归为 fact
export function normalizeKnowledgeType(type: string): KnowledgeType {
  return (KNOWLEDGE_TYPES as readonly string[]).includes(type)
    ? (type as KnowledgeType)
    : 'fact'
}
