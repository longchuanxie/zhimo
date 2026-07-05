// ProjectShell：项目级三栏布局
// 职责：左侧项目导航 + 中间主工作区 + 右侧智能助手面板
// 对应文档：06_工程实施补齐/01_客户端技术架构详细设计_v1.0.md

import { Outlet, useParams } from 'react-router-dom'
import { ProjectSidebar } from './ProjectSidebar'
import { AgentPanel } from './AgentPanel'

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>()

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        项目 ID 缺失
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧：项目导航 */}
      <aside className="w-[230px] border-r border-line bg-surface-2/40 overflow-y-auto flex-shrink-0">
        <ProjectSidebar projectId={projectId} />
      </aside>

      {/* 中间：主工作区 */}
      <main className="flex-1 overflow-auto bg-bg/40">
        <Outlet />
      </main>

      {/* 右侧：智能助手面板 */}
      <AgentPanel />
    </div>
  )
}
