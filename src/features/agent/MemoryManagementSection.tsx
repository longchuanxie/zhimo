// Agent 记忆管理区块
// 嵌入项目设置页面，支持记忆的增删改查
//
// 数据映射：AgentMemoryService.listMemories + createMemory + updateMemory + removeMemory + removeMemoriesByProject

import { useState } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
  Cog6ToothIcon,
  HandRaisedIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { Modal, ConfirmDialog } from '@/components/foundation/Modal'
import { useAsync } from '@/hooks/useAsync'
import {
  listMemories,
  createMemory,
  updateMemory,
  removeMemory,
  removeMemoriesByProject,
} from '@/services/agent/AgentMemoryService'
import { AGENT_MEMORY_KIND_LABEL } from '@/constants/status'
import type { AgentMemory, AgentMemoryKind, EntityId } from '@/types'

const MEMORY_KINDS: AgentMemoryKind[] = ['preference', 'fact', 'decision', 'style', 'summary']

type MemoryManagementSectionProps = {
  projectId: EntityId
}

export function MemoryManagementSection({ projectId }: MemoryManagementSectionProps) {
  const { state, refresh } = useAsync<AgentMemory[]>(
    () => listMemories(projectId),
    [projectId],
  )

  const [showFormModal, setShowFormModal] = useState(false)
  const [editingMemory, setEditingMemory] = useState<AgentMemory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentMemory | null>(null)
  const [viewingMemory, setViewingMemory] = useState<AgentMemory | null>(null)
  const [showClearAll, setShowClearAll] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const showMsg = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 3000)
  }

  const handleCreate = () => {
    setEditingMemory(null)
    setShowFormModal(true)
  }

  const handleEdit = (memory: AgentMemory) => {
    setEditingMemory(memory)
    setShowFormModal(true)
  }

  const handleFormSuccess = () => {
    setShowFormModal(false)
    setEditingMemory(null)
    refresh()
    showMsg(editingMemory ? '记忆已更新' : '记忆已添加')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const result = await removeMemory(deleteTarget.id)
    if (result.ok) {
      refresh()
      showMsg('记忆已删除')
    } else {
      showMsg(`删除失败：${result.error.message}`)
    }
    setDeleteTarget(null)
  }

  const handleClearAllConfirm = async () => {
    const result = await removeMemoriesByProject(projectId)
    if (result.ok) {
      refresh()
      showMsg('已清空全部记忆')
    } else {
      showMsg(`清空失败：${result.error.message}`)
    }
    setShowClearAll(false)
  }

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">Agent 记忆</h3>
          <p className="text-xs text-subtle mt-0.5">
            跨会话共享的长期记忆，AI 助手在对话时会自动参考。置信度 ≥ 50% 的记忆会被召回。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost text-danger hover:bg-danger-soft"
            onClick={() => setShowClearAll(true)}
            disabled={state.status !== 'success' || state.data.length === 0}
          >
            <AppIcon icon={TrashIcon} size="sm" />
            清空全部
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate}>
            <AppIcon icon={PlusIcon} size="sm" />
            添加记忆
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div className="rounded-md border px-4 py-2 bg-brand-soft border-brand/20">
          <p className="text-sm text-brand">{msg}</p>
        </div>
      )}

      {/* 内容区 */}
      {state.status === 'loading' && <LoadingState message="正在加载记忆列表..." />}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={refresh} title="记忆列表加载失败" />
      )}
      {state.status === 'success' && (
        <>
          {state.data.length === 0 ? (
            <EmptyState
              icon={SparklesIcon}
              title="还没有记忆"
              description="手动添加记忆，或在对话超过 20 轮后自动生成对话摘要。记忆会在 AI 助手对话时作为上下文参考。"
              primaryAction={{
                label: '添加记忆',
                icon: PlusIcon,
                onClick: handleCreate,
              }}
              hint="记忆类型：用户偏好 / 事实信息 / 关键决策 / 写作风格 / 对话摘要"
            />
          ) : (
            <div className="space-y-3">
              {state.data.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onView={() => setViewingMemory(memory)}
                  onEdit={() => handleEdit(memory)}
                  onDelete={() => setDeleteTarget(memory)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 新建/编辑弹窗 */}
      {showFormModal && (
        <MemoryFormModal
          projectId={projectId}
          editingMemory={editingMemory}
          onClose={() => {
            setShowFormModal(false)
            setEditingMemory(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除记忆"
        description={`确定要删除这条${deleteTarget ? AGENT_MEMORY_KIND_LABEL[deleteTarget.kind] : ''}吗？删除后不可恢复。`}
        confirmLabel="删除"
        danger
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* 清空全部确认 */}
      <ConfirmDialog
        open={showClearAll}
        title="清空全部记忆"
        description="确定要删除本项目的所有记忆吗？此操作不可恢复，AI 助手将失去所有跨会话上下文。"
        confirmLabel="全部删除"
        danger
        onConfirm={handleClearAllConfirm}
        onClose={() => setShowClearAll(false)}
      />

      {/* 查看详情 */}
      {viewingMemory && (
        <MemoryDetailModal
          memory={viewingMemory}
          onClose={() => setViewingMemory(null)}
          onEdit={() => {
            handleEdit(viewingMemory)
            setViewingMemory(null)
          }}
        />
      )}
    </div>
  )
}

// ============ 子组件：记忆卡片 ============

type MemoryCardProps = {
  memory: AgentMemory
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

function MemoryCard({ memory, onView, onEdit, onDelete }: MemoryCardProps) {
  const kindLabel = AGENT_MEMORY_KIND_LABEL[memory.kind] ?? '记忆'
  const confidencePercent = Math.round(memory.confidence * 100)
  const isAutoExtracted = memory.sourceThreadId !== null

  return (
    <div className="card p-4 space-y-2">
      {/* 头部：类型标签 + 来源 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="tag-brand">{kindLabel}</span>
          <span className="flex items-center gap-1 text-xs text-subtle">
            <AppIcon icon={isAutoExtracted ? Cog6ToothIcon : HandRaisedIcon} size="xs" />
            {isAutoExtracted ? '自动提取' : '手动添加'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost text-muted hover:text-ink"
            onClick={onEdit}
            aria-label="编辑"
          >
            <AppIcon icon={PencilIcon} size="sm" />
          </button>
          <button
            type="button"
            className="btn-ghost text-danger hover:bg-danger-soft"
            onClick={onDelete}
            aria-label="删除"
          >
            <AppIcon icon={TrashIcon} size="sm" />
          </button>
        </div>
      </div>

      {/* 内容（点击查看全部） */}
      <button
        type="button"
        className="block w-full text-left cursor-pointer hover:text-brand transition-colors"
        onClick={onView}
      >
        <p className="text-sm text-ink line-clamp-3 whitespace-pre-wrap">{memory.content}</p>
      </button>

      {/* 底部：置信度 + 更新时间 */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">置信度</span>
          <div className="w-24 h-1.5 rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-muted">{confidencePercent}%</span>
        </div>
        <span className="text-xs text-subtle">
          {new Date(memory.updatedAt).toLocaleString('zh-CN')}
        </span>
      </div>
    </div>
  )
}

// ============ 子组件：新建/编辑表单弹窗 ============

type MemoryFormModalProps = {
  projectId: EntityId
  editingMemory: AgentMemory | null
  onClose: () => void
  onSuccess: () => void
}

function MemoryFormModal({ projectId, editingMemory, onClose, onSuccess }: MemoryFormModalProps) {
  const isEditing = editingMemory !== null
  const [kind, setKind] = useState<AgentMemoryKind>(editingMemory?.kind ?? 'fact')
  const [content, setContent] = useState(editingMemory?.content ?? '')
  const [confidence, setConfidence] = useState(editingMemory?.confidence ?? 0.7)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      setError('记忆内容不能为空')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = isEditing
      ? await updateMemory(editingMemory!.id, { content: content.trim(), confidence })
      : await createMemory({ projectId, kind, content: content.trim(), confidence })

    setSubmitting(false)

    if (result.ok) {
      onSuccess()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <Modal
      title={isEditing ? '编辑记忆' : '添加记忆'}
      open
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="submit"
            form="memory-form"
            className="btn-primary"
            disabled={submitting || !content.trim()}
          >
            {submitting ? '保存中...' : isEditing ? '保存' : '添加'}
          </button>
        </>
      }
    >
      <form id="memory-form" onSubmit={handleSubmit} className="space-y-4">
        {/* 类型选择 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink">
            类型
            {isEditing && <span className="text-subtle ml-1 text-xs">（创建后不可修改）</span>}
          </label>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as AgentMemoryKind)}
            disabled={isEditing}
          >
            {MEMORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {AGENT_MEMORY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {/* 内容输入 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink">
            内容<span className="text-danger ml-1">*</span>
          </label>
          <textarea
            className="input min-h-[100px] resize-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入记忆内容，如：用户偏好简洁的叙述风格"
            maxLength={1000}
          />
          <p className="text-xs text-subtle">{content.length} / 1000</p>
        </div>

        {/* 置信度滑块 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink">
            置信度：<span className="text-brand">{Math.round(confidence * 100)}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-subtle">置信度 ≥ 50% 的记忆会被 AI 助手自动召回</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md border border-danger/20 bg-danger-soft px-4 py-2">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  )
}

// ============ 子组件：记忆详情弹窗 ============

type MemoryDetailModalProps = {
  memory: AgentMemory
  onClose: () => void
  onEdit: () => void
}

function MemoryDetailModal({ memory, onClose, onEdit }: MemoryDetailModalProps) {
  const kindLabel = AGENT_MEMORY_KIND_LABEL[memory.kind] ?? '记忆'
  const confidencePercent = Math.round(memory.confidence * 100)
  const isAutoExtracted = memory.sourceThreadId !== null

  return (
    <Modal
      title="记忆详情"
      open
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn-primary" onClick={onEdit}>
            <AppIcon icon={PencilIcon} size="sm" />
            编辑
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 元信息 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="tag-brand">{kindLabel}</span>
          <span className="flex items-center gap-1 text-xs text-subtle">
            <AppIcon icon={isAutoExtracted ? Cog6ToothIcon : HandRaisedIcon} size="xs" />
            {isAutoExtracted ? '自动提取' : '手动添加'}
          </span>
          <span className="text-xs text-subtle">
            创建于 {new Date(memory.createdAt).toLocaleString('zh-CN')}
          </span>
          <span className="text-xs text-subtle">
            更新于 {new Date(memory.updatedAt).toLocaleString('zh-CN')}
          </span>
        </div>

        {/* 置信度 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">置信度</span>
          <div className="flex-1 h-1.5 rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-sm text-ink font-medium">{confidencePercent}%</span>
        </div>

        {/* 完整内容 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink">内容</label>
          <div className="card bg-surface-2 p-4 max-h-[400px] overflow-auto">
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{memory.content}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
