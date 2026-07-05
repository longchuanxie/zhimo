// 导出页
// 对应路由：/projects/:projectId/export
// 对应任务：DEV-083
//
// 职责：
// - 展示项目的导出任务列表
// - 提供新建导出入口（打开向导）
// - 支持重试失败任务、打开已导出文件

import { useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowDownTrayIcon,
  PlusIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import {
  listExportTasks,
  createExportTask,
  retryExportTask,
} from '@/services/export/ExportService'
import {
  EXPORT_TASK_STATUS_LABEL,
  EXPORT_FORMAT_LABEL,
  getStatusColor,
} from '@/constants/status'
import { toast } from '@/stores/toastStore'
import { ExportWizardModal } from './ExportWizardModal'
import type { ExportTask, ExportScope, ExportFormat, ExportOptions } from '@/types'

export function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [showWizard, setShowWizard] = useState(false)
  const [creating, setCreating] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const { state, refresh } = useAsync<ExportTask[]>(
    () => listExportTasks(projectId!),
    [projectId],
    { enabled: !!projectId },
  )

  const handleConfirmExport = async (input: {
    exportScope: ExportScope
    exportFormat: ExportFormat
    documentIds?: string[]
    outlineNodeIds?: string[]
    targetDirectory?: string
    exportOptions?: ExportOptions
  }) => {
    if (!projectId) return
    setCreating(true)
    const result = await createExportTask({ projectId, ...input })
    setCreating(false)

    if (result.ok) {
      setShowWizard(false)
      refresh()
    } else {
      toast.error(`导出失败：${result.error.message}`)
    }
  }

  const handleRetry = async (task: ExportTask) => {
    setRetryingId(task.id)
    const result = await retryExportTask(task.id)
    setRetryingId(null)
    if (result.ok) {
      refresh()
    } else {
      toast.error(`重试失败：${result.error.message}`)
    }
  }

  const handleOpenFile = (task: ExportTask) => {
    if (!task.filePath) return
    // MVP：提示文件路径，实际打开文件需要 Tauri shell 插件
    toast.info(`文件已保存到：${task.filePath}`)
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载导出任务..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="导出任务加载失败" />
  }

  const tasks = state.data

  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-line">
        <div className="flex items-center gap-2">
          <AppIcon icon={ArrowDownTrayIcon} size="sm" className="text-brand" />
          <h1 className="text-base font-bold text-ink">导出</h1>
        </div>
        <button
          type="button"
          className="btn-primary px-3 py-1.5"
          onClick={() => setShowWizard(true)}
        >
          <AppIcon icon={PlusIcon} size="sm" />
          新建导出
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <EmptyState
            icon={ArrowDownTrayIcon}
            title="还没有导出任务"
            description="将项目文档导出为 Markdown、TXT、Word、LaTeX 或 DOCX 格式，方便分享和归档。"
            primaryAction={{
              label: '新建导出',
              icon: PlusIcon,
              onClick: () => setShowWizard(true),
            }}
            hint="支持整项目、指定文档、大纲范围三种导出方式"
          />
        ) : (
          <div className="space-y-3 max-w-3xl">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-4 bg-surface border border-line rounded-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-2">
                  <AppIcon
                    icon={DocumentArrowDownIcon}
                    size="md"
                    className="text-muted"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusTag
                      status={task.status}
                      label={EXPORT_TASK_STATUS_LABEL[task.status]}
                      color={getStatusColor(task.status)}
                    />
                    <span className="text-xs text-subtle">
                      {EXPORT_FORMAT_LABEL[task.exportFormat]} ·{' '}
                      {task.exportScope === 'whole_project'
                        ? '整项目'
                        : task.exportScope === 'current_document'
                          ? '指定文档'
                          : '大纲范围'}
                    </span>
                  </div>
                  {task.filePath ? (
                    <p className="text-xs text-muted truncate" title={task.filePath}>
                      {task.filePath}
                    </p>
                  ) : task.errorMessage ? (
                    <p className="text-xs text-danger truncate">{task.errorMessage}</p>
                  ) : (
                    <p className="text-xs text-subtle">等待导出...</p>
                  )}
                  <p className="text-xs text-subtle mt-0.5">
                    {new Date(task.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1">
                  {task.status === 'failed' && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => handleRetry(task)}
                      disabled={retryingId === task.id}
                      title="重试"
                    >
                      <AppIcon icon={ArrowPathIcon} size="sm" />
                    </button>
                  )}
                  {task.status === 'succeeded' && task.filePath && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => handleOpenFile(task)}
                      title="打开文件"
                    >
                      <AppIcon icon={DocumentArrowDownIcon} size="sm" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 导出向导 */}
      {showWizard && projectId && (
        <ExportWizardModal
          projectId={projectId}
          creating={creating}
          onConfirm={handleConfirmExport}
          onCancel={() => !creating && setShowWizard(false)}
        />
      )}
    </div>
  )
}
