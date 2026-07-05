// 知识库列表页
// 对应路由：/projects/:projectId/knowledge
// 数据映射：KnowledgeService.listKnowledge + createKnowledge + deleteKnowledge
//
// 知识库与卡片库的差异：
// - 知识库强调「已沉淀的事实/设定/规则」，支持置信度和版本演进
// - 列表展示更接近「条目」而非「卡片」，突出标题、类型、置信度

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  BookOpenIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import {
  listKnowledge,
  createKnowledge,
  deleteKnowledge,
  updateKnowledgeStatusService,
} from '@/services/knowledge/KnowledgeService'
import { ok } from '@/types/service'
import { KNOWLEDGE_STATUS_LABEL } from '@/constants/status'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_ICON,
  normalizeKnowledgeType,
  type KnowledgeType,
} from '@/constants/knowledgeTypes'
import { toast } from '@/stores/toastStore'
import type { Knowledge, KnowledgeStatus } from '@/types'

const STATUS_FILTERS: Array<{ value: KnowledgeStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'deprecated', label: '已废弃' },
  { value: 'conflict', label: '有冲突' },
  { value: 'forbidden', label: '禁止使用' },
]

const TYPE_FILTERS: Array<{ value: KnowledgeType | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  ...KNOWLEDGE_TYPES.map((t) => ({ value: t, label: KNOWLEDGE_TYPE_LABEL[t] })),
]

export function KnowledgeListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<KnowledgeStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<KnowledgeType | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { state, refresh } = useAsync<Knowledge[]>(
    async () => {
      const result = await listKnowledge(
        projectId!,
        statusFilter === 'all' ? undefined : statusFilter,
      )
      if (!result.ok) return result
      if (typeFilter === 'all') return ok(result.data)
      return ok(result.data.filter((k) => normalizeKnowledgeType(k.type) === typeFilter))
    },
    [projectId, statusFilter, typeFilter],
    { enabled: !!projectId },
  )
  const { confirm } = useDialog()

  const handleDelete = async (item: Knowledge) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除知识「${item.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(item.id)
    const result = await deleteKnowledge(item.id)
    setDeletingId(null)

    if (result.ok) {
      refresh()
    } else {
      toast.error(`删除失败：${result.error.message}`)
    }
  }

  const handleStatusChange = async (item: Knowledge, status: KnowledgeStatus) => {
    if (item.status === status) return
    const result = await updateKnowledgeStatusService(item.id, status)
    if (result.ok) {
      refresh()
      toast.success(`「${item.title}」状态已更新为${KNOWLEDGE_STATUS_LABEL[status]}`)
    } else {
      toast.error(`状态更新失败：${result.error.message}`)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (!items) return
    setSelectedIds(new Set(items.map((item) => item.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    const confirmed = await confirm({
      title: '确认批量删除',
      description: `确定要删除选中的 ${selectedIds.size} 条知识吗？删除后不可恢复。`,
      danger: true,
    })
    if (!confirmed) return

    const ids = Array.from(selectedIds)
    const results = await Promise.all(ids.map((id) => deleteKnowledge(id)))
    const failed = results.filter((r) => !r.ok)
    clearSelection()
    refresh()

    if (failed.length === 0) {
      toast.success(`已成功删除 ${ids.length} 条知识`)
    } else {
      toast.error(`删除完成：成功 ${ids.length - failed.length} 条，失败 ${failed.length} 条`)
    }
  }

  const handleBatchStatusChange = async (status: KnowledgeStatus) => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map((id) => updateKnowledgeStatusService(id, status)),
    )
    const failed = results.filter((r) => !r.ok)
    clearSelection()
    refresh()

    if (failed.length === 0) {
      toast.success(`${ids.length} 条知识已更新为${KNOWLEDGE_STATUS_LABEL[status]}`)
    } else {
      toast.error(`更新完成：成功 ${ids.length - failed.length} 条，失败 ${failed.length} 条`)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载知识库..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="知识库加载失败" />
  }

  const items = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">知识库</h1>
          <p className="text-sm text-muted mt-1">
            共 {items.length} 条知识。知识库用于沉淀已确认的事实、设定与规则，可被 AI 助手作为长期上下文参考。
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
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <AppIcon icon={PlusIcon} size="sm" />
            新建知识
          </button>
        </div>
      </div>

      {/* 状态 + 类型筛选 */}
      <div className="flex items-center gap-4 px-8 py-3 border-b border-line overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">状态</span>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
        <div className="h-4 w-px bg-line" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">类型</span>
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                typeFilter === filter.value
                  ? 'bg-brand text-white'
                  : 'bg-surface text-muted border border-line hover:bg-surface-2'
              }`}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* 批量操作条 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-8 py-2 border-b border-line bg-surface">
          <span className="text-sm text-ink font-medium">
            已选择 {selectedIds.size} 条
          </span>
          <button
            type="button"
            className="btn-ghost text-xs px-2 py-1"
            onClick={selectAll}
          >
            全选
          </button>
          <button
            type="button"
            className="btn-ghost text-xs px-2 py-1"
            onClick={clearSelection}
          >
            取消选择
          </button>
          <div className="h-4 w-px bg-line" />
          <select
            aria-label="批量修改状态"
            className="input text-xs py-1 px-2 w-32"
            value=""
            onChange={(e) =>
              handleBatchStatusChange(e.target.value as KnowledgeStatus)
            }
          >
            <option value="" disabled>
              修改状态
            </option>
            {STATUS_FILTERS.filter((f) => f.value !== 'all').map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-danger text-xs px-2 py-1"
            onClick={handleBatchDelete}
          >
            <AppIcon icon={TrashIcon} size="sm" />
            删除
          </button>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {items.length === 0 ? (
          <EmptyState
            icon={BookOpenIcon}
            title="还没有知识条目"
            description="知识库用于沉淀已确认的事实、设定与规则。可手动创建，或由助手从资料/对话中提取后保存。确认后的知识会作为 AI 助手的长期上下文参考。"
            primaryAction={{
              label: '新建知识',
              icon: PlusIcon,
              onClick: () => setShowCreateModal(true),
            }}
            hint="知识状态：待确认 → 已确认 / 已废弃 / 有冲突 / 禁止使用"
          />
        ) : (
          <KnowledgeGrid
            items={items}
            deletingId={deletingId}
            selectedIds={selectedIds}
            onOpen={(k) => navigate(`/projects/${projectId}/knowledge/${k.id}`)}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onToggleSelect={toggleSelect}
          />
        )}
      </div>

      {/* 新建知识弹窗 */}
      {showCreateModal && projectId && (
        <CreateKnowledgeModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(knowledgeId) => {
            setShowCreateModal(false)
            navigate(`/projects/${projectId}/knowledge/${knowledgeId}`)
          }}
        />
      )}
    </div>
  )
}

// ============ 子组件：知识网格 ============

type KnowledgeGridProps = {
  items: Knowledge[]
  deletingId: string | null
  selectedIds: Set<string>
  onOpen: (item: Knowledge) => void
  onDelete: (item: Knowledge) => void
  onStatusChange: (item: Knowledge, status: KnowledgeStatus) => void
  onToggleSelect: (id: string) => void
}

function KnowledgeGrid({
  items,
  deletingId,
  selectedIds,
  onOpen,
  onDelete,
  onStatusChange,
  onToggleSelect,
}: KnowledgeGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <KnowledgeItem
          key={item.id}
          item={item}
          deleting={deletingId === item.id}
          selected={selectedIds.has(item.id)}
          onOpen={() => onOpen(item)}
          onDelete={() => onDelete(item)}
          onStatusChange={(status) => onStatusChange(item, status)}
          onToggleSelect={() => onToggleSelect(item.id)}
        />
      ))}
    </div>
  )
}

// ============ 子组件：知识条目 ============

type KnowledgeItemProps = {
  item: Knowledge
  deleting: boolean
  selected: boolean
  onOpen: () => void
  onDelete: () => void
  onStatusChange: (status: KnowledgeStatus) => void
  onToggleSelect: () => void
}

function KnowledgeItem({
  item,
  deleting,
  selected,
  onOpen,
  onDelete,
  onStatusChange,
  onToggleSelect,
}: KnowledgeItemProps) {
  const normalizedType = normalizeKnowledgeType(item.type)
  const TypeIcon = KNOWLEDGE_TYPE_ICON[normalizedType]

  return (
    <div
      className={`card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${
        selected ? 'ring-2 ring-brand' : ''
      }`}
    >
      {/* 头部：复选框 + 状态 + 类型 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="选择知识"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-line h-4 w-4 cursor-pointer"
          />
          <div className="relative group">
            <span className="rounded-md transition-shadow group-hover:ring-2 group-hover:ring-brand/20 inline-flex">
              <StatusTag
                status={item.status}
                label={KNOWLEDGE_STATUS_LABEL[item.status]}
                icon={
                  <AppIcon
                    icon={ChevronDownIcon}
                    size="xs"
                    className="ml-0.5 text-current opacity-70 group-hover:opacity-100"
                  />
                }
              />
            </span>
            <select
              aria-label="更改状态"
              className="absolute inset-0 opacity-0 cursor-pointer"
              value={item.status}
              onChange={(e) => onStatusChange(e.target.value as KnowledgeStatus)}
            >
              {STATUS_FILTERS.filter((f) => f.value !== 'all').map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-subtle">
          {TypeIcon && <AppIcon icon={TypeIcon} size="sm" />}
          {KNOWLEDGE_TYPE_LABEL[normalizedType]}
        </span>
      </div>

      {/* 标题 */}
      <button type="button" className="text-left" onClick={onOpen}>
        <h3 className="text-base font-bold text-ink hover:text-brand transition-colors line-clamp-2">
          {item.title}
        </h3>
      </button>

      {/* 摘要 / 内容预览 */}
      <p className="text-sm text-muted line-clamp-4 min-h-[5rem]">
        {item.summary ?? item.content}
      </p>

      {/* 底部信息 */}
      <div className="flex items-center justify-between pt-2 border-t border-line text-xs text-subtle">
        <div className="flex items-center gap-2">
          {item.aiUsageAllowed ? (
            <StatusTag status="active" label="允许 AI" color="brand" />
          ) : (
            <StatusTag status="archived" label="禁止 AI" color="default" />
          )}
          {item.confidence !== null && (
            <span className="text-subtle">
              置信度 {(item.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
          onClick={onDelete}
          disabled={deleting}
          aria-label="删除知识"
        >
          <AppIcon icon={TrashIcon} size="sm" />
        </button>
      </div>
    </div>
  )
}

// ============ 子组件：新建知识弹窗 ============

type CreateKnowledgeModalProps = {
  projectId: string
  onClose: () => void
  onSuccess: (knowledgeId: string) => void
}

function CreateKnowledgeModal({
  projectId,
  onClose,
  onSuccess,
}: CreateKnowledgeModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('fact')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [confidence, setConfidence] = useState('')
  const [aiUsageAllowed, setAiUsageAllowed] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }

    const confidenceValue = confidence.trim()
      ? Number(confidence)
      : null

    if (
      confidenceValue !== null &&
      (Number.isNaN(confidenceValue) ||
        confidenceValue < 0 ||
        confidenceValue > 1)
    ) {
      setError('置信度必须是 0~1 之间的数字')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await createKnowledge({
      projectId,
      title: title.trim(),
      type: type.trim() || 'fact',
      content,
      summary: summary.trim() || undefined,
      aiUsageAllowed,
      confidence: confidenceValue ?? undefined,
    })

    setSubmitting(false)

    if (result.ok) {
      onSuccess(result.data.id)
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink">新建知识</h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-auto p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">
                标题<span className="text-danger ml-1">*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="知识标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">类型</label>
              <select
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {KNOWLEDGE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">摘要</label>
            <input
              type="text"
              className="input"
              placeholder="一句话概括（可选）"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              内容<span className="text-danger ml-1">*</span>
            </label>
            <textarea
              className="input min-h-[200px] resize-y text-sm"
              placeholder="知识内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              置信度（0~1，可选）
            </label>
            <input
              type="text"
              className="input"
              placeholder="例如：0.85"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aiUsageAllowed}
              onChange={(e) => setAiUsageAllowed(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-sm text-ink">
              允许 AI 助手使用此知识作为上下文
            </span>
          </label>

          {error && (
            <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !title.trim() || !content.trim()}
            >
              {submitting ? '创建中...' : '创建知识'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
