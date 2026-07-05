// 项目侧边导航
// 显示项目内所有模块的导航入口

import { NavLink } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { NAV_ICONS } from '@/constants/icons'
import { NAV_LABELS } from '@/constants/objectLabels'

type NavItem = {
  key: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  path: string
}

type ProjectSidebarProps = {
  projectId: string
}

function buildNavItems(projectId: string): NavItem[] {
  const base = `/projects/${projectId}`
  return [
    { key: 'home', label: NAV_LABELS.projectHome, icon: NAV_ICONS.projectHome, path: base },
    { key: 'documents', label: NAV_LABELS.documents, icon: NAV_ICONS.documents, path: `${base}/documents` },
    { key: 'sources', label: NAV_LABELS.sources, icon: NAV_ICONS.sources, path: `${base}/sources` },
    { key: 'references', label: NAV_LABELS.references, icon: NAV_ICONS.references, path: `${base}/references` },
    { key: 'cards', label: NAV_LABELS.cards, icon: NAV_ICONS.cards, path: `${base}/cards` },
    { key: 'outline', label: NAV_LABELS.outline, icon: NAV_ICONS.outline, path: `${base}/outline` },
    { key: 'knowledge', label: NAV_LABELS.knowledge, icon: NAV_ICONS.knowledge, path: `${base}/knowledge` },
    { key: 'agent', label: NAV_LABELS.agent, icon: NAV_ICONS.agent, path: `${base}/agent` },
    { key: 'export', label: NAV_LABELS.export, icon: NAV_ICONS.export, path: `${base}/export` },
  ]
}

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const navItems = buildNavItems(projectId)

  return (
    <nav className="flex flex-col gap-1 p-3 h-full">
      {/* 返回项目列表 / 切换项目 */}
      <NavLink
        to="/projects"
        className={({ isActive }) =>
          `nav-item ${isActive ? 'nav-item-active' : ''}`
        }
      >
        <AppIcon icon={RectangleStackIcon} size="sm" />
        <span>切换项目</span>
      </NavLink>

      <div className="border-t border-line my-2" />

      {/* 项目内模块导航 */}
      {navItems.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          end={item.key === 'home'}
          className={({ isActive }) =>
            `nav-item ${isActive ? 'nav-item-active' : ''}`
          }
        >
          <AppIcon icon={item.icon} size="sm" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
