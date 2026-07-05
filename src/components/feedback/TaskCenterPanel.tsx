// 任务中心面板（右侧抽屉）
// 对应任务：DEV-089
//
// 职责：
// - 展示所有本地任务的状态与进度
// - 支持按状态筛选
// - 支持重试失败任务、取消运行中任务
//
// 显示控制：通过 appStore.taskCenterOpen 全局开关

import { useState, useCallback, useEffect } from 'react'
import {
  Cog6ToothIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { TaskProgressItem } from '@/components/feedback/TaskProgressItem'
import { useAppStore } from '@/stores/appStore'
import {
  listAllTasks,
  retryTask,
  cancelTask,
} from '@/services/task/TaskService'
import { toast } from '@/stores/toastStore'
import type { Task, TaskStatus } from '@/types'

const STATUS_FILTERS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'pending', label: '等待中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
]

export function TaskCenterPanel() {
  const taskCenterOpen = useAppStore((s) => s.taskCenterOpen)
  const setTaskCenterOpen = useAppStore((s) => s.setTaskCenterOpen)

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listAllTasks(
      statusFilter === 'all' ? undefined : statusFilter,
    )
    setLoading(false)

    if (result.ok) {
      setTasks(result.data)
    } else {
      setError(result.error.message)
    }
  }, [statusFilter])

  useEffect(() => {
    if (taskCenterOpen) {
      loadTasks()
    }
  }, [taskCenterOpen, loadTasks])

  // 自动刷新（运行中任务每 3 秒刷新一次）
  useEffect(() => {
    if (!taskCenterOpen) return
    const hasRunning = tasks.some(
      (t) => t.status === 'running' || t.status === 'pending',
    )
    if (!hasRunning) return

    const timer = setInterval(loadTasks, 3000)
    return () => clearInterval(timer)
  }, [taskCenterOpen, tasks, loadTasks])

  const handleRetry = async (task: Task) => {
    const result = await retryTask(task.id)
    if (result.ok) {
      loadTasks()
    } else {
      toast.error(`重试失败：${result.error.message}`)
    }
  }

  const handleCancel = async (task: Task) => {
    const result = await cancelTask(task.id)
    if (result.ok) {
      loadTasks()
    } else {
      toast.error(`取消失败：${result.error.message}`)
    }
  }

  if (!taskCenterOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30">
      {/* 点击遮罩关闭 */}
      <div
        className="absolute inset-0"
        onClick={() => setTaskCenterOpen(false)}
      />

      {/* 面板 */}
      <aside className="relative w-[380px] bg-surface border-l border-line flex flex-col shadow-xl">
        {/* 头部 */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-soft">
            <AppIcon icon={Cog6ToothIcon} size="sm" className="text-brand" />
          </div>
          <h2 className="text-sm font-bold text-ink flex-1">任务中心</h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={loadTasks}
            aria-label="刷新"
          >
            <AppIcon icon={ArrowPathIcon} size="sm" />
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={() => setTaskCenterOpen(false)}
            aria-label="关闭"
          >
            <AppIcon icon={XMarkIcon} size="sm" />
          </button>
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-line overflow-x-auto">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                statusFilter === filter.value
                  ? 'bg-ink text-white'
                  : 'bg-surface text-muted border border-line hover:bg-surface-2'
              }`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-3 mt-2 rounded-md bg-danger-soft border border-danger/20 px-3 py-2">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {/* 任务列表 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <LoadingState message="正在加载任务..." />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={Cog6ToothIcon}
              title="暂无任务"
              description="资料解析、智能助手调用、文档导出等异步任务会在这里显示进度。"
              hint="任务状态会自动刷新"
            />
          ) : (
            <div>
              {tasks.map((task) => (
                <TaskProgressItem
                  key={task.id}
                  task={task}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
