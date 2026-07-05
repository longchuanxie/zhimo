// 应用根组件
// 路由配置对应文档：06_工程实施补齐/04_前端路由与状态管理设计_v1.0.md

import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectShell } from '@/components/layout/ProjectShell'
import { ProjectListPage } from '@/features/project/ProjectListPage'
import { CreateProjectPage } from '@/features/project/CreateProjectPage'
import { CreateProjectGuidedPage } from '@/features/project/CreateProjectGuidedPage'
import { CreateProjectFromDocumentPage } from '@/features/project/CreateProjectFromDocumentPage'
import { ProjectOverviewPage } from '@/features/project/ProjectOverviewPage'
import { ProjectSettingsPage } from '@/features/project/ProjectSettingsPage'
import { DocumentListPage } from '@/features/document/DocumentListPage'
import { DocumentEditorPage } from '@/features/document/DocumentEditorPage'
import { SourceListPage } from '@/features/source/SourceListPage'
import { SourceDetailPage } from '@/features/source/SourceDetailPage'
import { ReferencesPage } from '@/features/references/ReferencesPage'
import { CardListPage } from '@/features/card/CardListPage'
import { CardDetailPage } from '@/features/card/CardDetailPage'
import { OutlinePage } from '@/features/outline/OutlinePage'
import { KnowledgeListPage } from '@/features/knowledge/KnowledgeListPage'
import { KnowledgeDetailPage } from '@/features/knowledge/KnowledgeDetailPage'
import { ModelSettingsPage } from '@/features/model/ModelSettingsPage'
import { ExportPage } from '@/features/export/ExportPage'
import { PlaceholderPage } from '@/features/PlaceholderPage'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { useAppInit } from '@/hooks/useAppInit'

export default function App() {
  const initState = useAppInit()

  // 初始化中：显示加载状态
  if (initState.status === 'initializing') {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <LoadingState message="正在初始化应用环境..." />
      </div>
    )
  }

  // 初始化失败：显示错误状态
  if (initState.status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <ErrorState
          error={{
            code: 'UNKNOWN_ERROR',
            message: initState.message,
            retryable: true,
          }}
          onRetry={() => window.location.reload()}
          title="应用初始化失败"
        />
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* 默认重定向到项目列表 */}
        <Route index element={<Navigate to="/projects" replace />} />

        {/* 本地项目库 */}
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<CreateProjectPage />} />
        <Route path="projects/new-guided" element={<CreateProjectGuidedPage />} />
        <Route path="projects/new-from-document" element={<CreateProjectFromDocumentPage />} />

        {/* 项目内路由：使用 ProjectShell 三栏布局 */}
        <Route path="projects/:projectId" element={<ProjectShell />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path="documents" element={<DocumentListPage />} />
          <Route path="documents/:documentId" element={<DocumentEditorPage />} />
          <Route path="sources" element={<SourceListPage />} />
          <Route path="sources/:sourceId" element={<SourceDetailPage />} />
          <Route path="references" element={<ReferencesPage />} />
          <Route path="cards" element={<CardListPage />} />
          <Route path="cards/:cardId" element={<CardDetailPage />} />
          <Route path="outline" element={<OutlinePage />} />
          <Route path="knowledge" element={<KnowledgeListPage />} />
          <Route path="knowledge/:knowledgeId" element={<KnowledgeDetailPage />} />
          <Route path="agent" element={<PlaceholderPage title="助手对话" />} />
          <Route path="export" element={<ExportPage />} />
        </Route>

        {/* 全局设置 */}
        <Route path="settings/models" element={<ModelSettingsPage />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  )
}
