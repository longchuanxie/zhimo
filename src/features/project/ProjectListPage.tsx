// 项目列表页
// 对应路由：/projects
// 对应文档：02_UX_UI_原型与规范/prototypes/高保真客户端原型_v0.2_数据API对齐.html
// 数据映射：ProjectService.listProjects

import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  FolderIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  TrashIcon,
  Cog6ToothIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import { listProjects, deleteProject } from '@/services/project/ProjectService'
import { PROJECT_TYPE_LABEL, PROJECT_STATUS_LABEL } from '@/constants/status'
import { UI_TEXT } from '@/constants/objectLabels'
import { toast } from '@/stores/toastStore'
import type { Project } from '@/types'

export function ProjectListPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { state, refresh } = useAsync<Project[]>(
    () => listProjects({ keyword: keyword.trim() || undefined }),
    [keyword],
  )
  const { confirm } = useDialog()

  const handleDelete = async (project: Project) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除项目「${project.name}」吗？项目数据将保留在本地数据库，但不会显示在列表中。`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(project.id)
    const result = await deleteProject(project.id)
    setDeletingId(null)

    if (!result.ok) {
      toast.error(`删除失败：${result.error.message}`)
      return
    }
    refresh()
  }

  // 加载中
  if (state.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingState message="正在加载项目列表..." />
      </div>
    )
  }

  // 加载失败
  if (state.status === 'error') {
    return (
      <div className="h-full flex items-center justify-center">
        <ErrorState error={state.error} onRetry={refresh} title="项目列表加载失败" />
      </div>
    )
  }

  const projects = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">本地项目库</h1>
          <p className="text-sm text-muted mt-1">
            数据保存在本机，无需登录。MVP 默认使用 default_workspace。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={refresh}
            aria-label="刷新"
          >
            <AppIcon icon={ArrowPathIcon} size="sm" />
            刷新
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/projects/new')}
          >
            <AppIcon icon={PlusIcon} size="sm" />
            手动创建
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/projects/new-from-document')}
          >
            <AppIcon icon={ArrowUpTrayIcon} size="sm" />
            {UI_TEXT.createProjectFromDocument}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/projects/new-guided')}
          >
            <AppIcon icon={SparklesIcon} size="sm" />
            AI 引导创建
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-8 py-4 border-b border-line">
        <div className="relative max-w-md">
          <AppIcon
            icon={MagnifyingGlassIcon}
            size="sm"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            type="text"
            className="input pl-9"
            placeholder="搜索项目名称或描述..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderIcon}
            title={keyword ? '没有匹配的项目' : '还没有写作项目'}
            description={
              keyword
                ? '尝试更换关键词，或清空搜索查看全部项目。'
                : '创建你的第一个写作项目，开始从资料收集、大纲组织到正文写作的完整创作流程。'
            }
            primaryAction={
              keyword
                ? { label: '清空搜索', onClick: () => setKeyword('') }
                : {
                    label: 'AI 引导创建',
                    icon: SparklesIcon,
                    onClick: () => navigate('/projects/new-guided'),
                  }
            }
            secondaryAction={
              keyword
                ? undefined
                : {
                    label: '手动创建',
                    icon: PlusIcon,
                    onClick: () => navigate('/projects/new'),
                  }
            }
            hint="MVP 支持研究/论文、小说/长文、自由写作三种项目类型。"
          />
        ) : (
          <ProjectGrid
            projects={projects}
            deletingId={deletingId}
            onOpen={(p) => navigate(`/projects/${p.id}`)}
            onSettings={(p) => navigate(`/projects/${p.id}/settings`)}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}

// ============ 子组件：项目卡片网格 ============

type ProjectGridProps = {
  projects: Project[]
  deletingId: string | null
  onOpen: (project: Project) => void
  onSettings: (project: Project) => void
  onDelete: (project: Project) => void
}

function ProjectGrid({
  projects,
  deletingId,
  onOpen,
  onSettings,
  onDelete,
}: ProjectGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          deleting={deletingId === project.id}
          onOpen={() => onOpen(project)}
          onSettings={() => onSettings(project)}
          onDelete={() => onDelete(project)}
        />
      ))}
    </div>
  )
}

// ============ 子组件：项目卡片 ============

type ProjectCardProps = {
  project: Project
  deleting: boolean
  onOpen: () => void
  onSettings: () => void
  onDelete: () => void
}

function ProjectCard({
  project,
  deleting,
  onOpen,
  onSettings,
  onDelete,
}: ProjectCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* 头部：类型 + 状态 */}
      <div className="flex items-center justify-between">
        <StatusTag
          status={project.type}
          label={PROJECT_TYPE_LABEL[project.type]}
          color="accent"
        />
        <StatusTag
          status={project.status}
          label={PROJECT_STATUS_LABEL[project.status]}
        />
      </div>

      {/* 标题 */}
      <button
        type="button"
        className="text-left"
        onClick={onOpen}
      >
        <h3 className="text-lg font-bold text-ink hover:text-brand transition-colors">
          {project.name}
        </h3>
      </button>

      {/* 描述 */}
      <p className="text-sm text-muted line-clamp-2 min-h-[2.5rem]">
        {project.description || '暂无描述'}
      </p>

      {/* 字数进度 */}
      <div className="flex items-center gap-2 text-xs text-subtle">
        <span>{project.currentWordCount.toLocaleString()} 字</span>
        {project.targetWordCount > 0 && (
          <>
            <span>/</span>
            <span>{project.targetWordCount.toLocaleString()} 字目标</span>
          </>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex items-center justify-between pt-2 border-t border-line">
        <span className="text-xs text-subtle">
          更新于 {formatDate(project.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onSettings}
            aria-label="项目设置"
          >
            <AppIcon icon={Cog6ToothIcon} size="sm" />
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
            onClick={onDelete}
            disabled={deleting}
            aria-label="删除项目"
          >
            <AppIcon icon={TrashIcon} size="sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

/// 格式化日期为 YYYY-MM-DD
function formatDate(iso: string): string {
  try {
    return iso.slice(0, 10)
  } catch {
    return iso
  }
}
