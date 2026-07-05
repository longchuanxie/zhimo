// 项目首页
// 对应路由：/projects/:projectId
// 对应文档：02_UX_UI_原型与规范/prototypes/高保真客户端原型_v0.2_数据API对齐.html
// 数据映射：ProjectService.getProjectOverview

import { useParams, useNavigate } from 'react-router-dom'
import {
  DocumentTextIcon,
  ArchiveBoxIcon,
  Squares2X2Icon,
  CircleStackIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import { getProjectOverview } from '@/services/project/ProjectService'
import {
  PROJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
} from '@/constants/status'
import type { ProjectOverview } from '@/services/project/ProjectService'
import type { ComponentType, SVGProps } from 'react'

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const { state, refresh } = useAsync<ProjectOverview>(
    () => getProjectOverview(projectId!),
    [projectId],
    { enabled: !!projectId },
  )

  if (state.status === 'loading') {
    return <LoadingState message="正在加载项目首页..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="项目加载失败" />
  }

  const { project } = state.data

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        {/* 项目头部 */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
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
            <h1 className="text-3xl font-bold text-ink">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted leading-relaxed max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(`/projects/${projectId}/settings`)}
          >
            <AppIcon icon={Cog6ToothIcon} size="sm" />
            项目设置
          </button>
        </div>

        {/* 字数进度 */}
        <WordCountCard
          current={project.currentWordCount}
          target={project.targetWordCount}
        />

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={DocumentTextIcon}
            label="文档"
            count={state.data.documentCount}
            onClick={() => navigate(`/projects/${projectId}/documents`)}
          />
          <StatCard
            icon={ArchiveBoxIcon}
            label="资料"
            count={state.data.sourceCount}
            onClick={() => navigate(`/projects/${projectId}/sources`)}
          />
          <StatCard
            icon={Squares2X2Icon}
            label="卡片"
            count={state.data.cardCount}
            onClick={() => navigate(`/projects/${projectId}/cards`)}
          />
          <StatCard
            icon={CircleStackIcon}
            label="知识"
            count={state.data.knowledgeCount}
            onClick={() => navigate(`/projects/${projectId}/knowledge`)}
          />
        </div>

        {/* 快捷操作 */}
        <div className="card p-5">
          <h2 className="text-base font-bold text-ink mb-4">快捷操作</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction
              icon={PlusIcon}
              label="新建文档"
              onClick={() => navigate(`/projects/${projectId}/documents`)}
            />
            <QuickAction
              icon={ArchiveBoxIcon}
              label="导入资料"
              onClick={() => navigate(`/projects/${projectId}/sources`)}
            />
            <QuickAction
              icon={DocumentTextIcon}
              label="管理大纲"
              onClick={() => navigate(`/projects/${projectId}/outline`)}
            />
            <QuickAction
              icon={ArrowDownTrayIcon}
              label="导出文档"
              onClick={() => navigate(`/projects/${projectId}/export`)}
            />
          </div>
        </div>

        {/* 写作目标与规则 */}
        {(project.writingGoal || project.targetReader || project.styleRules || project.forbiddenRules) && (
          <div className="card p-5">
            <h2 className="text-base font-bold text-ink mb-4">项目设定</h2>
            <div className="space-y-4">
              {project.writingGoal && (
                <SettingItem label="写作目标" content={project.writingGoal} />
              )}
              {project.targetReader && (
                <SettingItem label="目标读者" content={project.targetReader} />
              )}
              {project.styleRules && (
                <SettingItem label="写作风格规则" content={project.styleRules} />
              )}
              {project.forbiddenRules && (
                <SettingItem label="禁止规则" content={project.forbiddenRules} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 子组件：字数进度卡片 ============

type WordCountCardProps = {
  current: number
  target: number
}

function WordCountCard({ current, target }: WordCountCardProps) {
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-ink">写作进度</h2>
        <span className="text-sm text-muted">
          {current.toLocaleString()} 字
          {target > 0 && ` / ${target.toLocaleString()} 字`}
        </span>
      </div>
      {target > 0 ? (
        <>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs text-subtle mt-2">已完成 {percent}%</p>
        </>
      ) : (
        <p className="text-sm text-subtle">未设置目标字数，前往项目设置可添加目标。</p>
      )}
    </div>
  )
}

// ============ 子组件：统计卡片 ============

type StatCardProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  count: number
  onClick: () => void
}

function StatCard({ icon, label, count, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
      onClick={onClick}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft">
        <AppIcon icon={icon} size="md" className="text-brand" />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink leading-tight">{count}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </button>
  )
}

// ============ 子组件：快捷操作 ============

type QuickActionProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  onClick: () => void
}

function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-2 p-4 rounded-md border border-line bg-surface hover:bg-surface-2 transition-colors"
      onClick={onClick}
    >
      <AppIcon icon={icon} size="md" className="text-brand" />
      <span className="text-sm font-medium text-ink">{label}</span>
    </button>
  )
}

// ============ 子组件：设定项 ============

type SettingItemProps = {
  label: string
  content: string
}

function SettingItem({ label, content }: SettingItemProps) {
  return (
    <div>
      <div className="text-xs font-semibold text-subtle mb-1">{label}</div>
      <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  )
}
