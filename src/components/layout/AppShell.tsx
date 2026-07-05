// AppShell：应用级布局
// 职责：顶栏 + 主内容区 + 全局浮层（设置面板 / 任务中心 / Toast 通知）
// 不包含业务逻辑，仅负责布局组合

import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { SettingsPanel } from './SettingsPanel'
import { GlobalDialogHost } from './GlobalDialogHost'
import { TaskCenterPanel } from '@/components/feedback/TaskCenterPanel'
import { ToastContainer } from '@/components/feedback/ToastContainer'

export function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <TopBar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      {/* 全局浮层 */}
      <SettingsPanel />
      <TaskCenterPanel />
      <ToastContainer />
      <GlobalDialogHost />
    </div>
  )
}
