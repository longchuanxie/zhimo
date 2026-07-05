// 卡片列表页
// 对应路由：/projects/:projectId/cards
// 数据映射：CardService.listCards + createCard + deleteCard

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Squares2X2Icon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import {
  listCards,
  createCard,
  deleteCard,
} from '@/services/card/CardService'
import { CARD_STATUS_LABEL } from '@/constants/status'
import { toast } from '@/stores/toastStore'
import type { Card, CardStatus } from '@/types'

const STATUS_FILTERS: Array<{ value: CardStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'deprecated', label: '已废弃' },
]

export function CardListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CardStatus | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { state, refresh } = useAsync<Card[]>(
    () => listCards(projectId!, statusFilter === 'all' ? undefined : statusFilter),
    [projectId, statusFilter],
    { enabled: !!projectId },
  )
  const { confirm } = useDialog()

  const handleDelete = async (card: Card) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除卡片「${card.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(card.id)
    const result = await deleteCard(card.id)
    setDeletingId(null)

    if (result.ok) {
      refresh()
    } else {
      toast.error(`删除失败：${result.error.message}`)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载卡片列表..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="卡片列表加载失败" />
  }

  const cards = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">卡片库</h1>
          <p className="text-sm text-muted mt-1">
            共 {cards.length} 张卡片。卡片是结构化的知识单元，可从资料片段或助手消息生成。
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
            新建卡片
          </button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex items-center gap-2 px-8 py-3 border-b border-line">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {cards.length === 0 ? (
          <EmptyState
            icon={Squares2X2Icon}
            title="还没有卡片"
            description="卡片是结构化的知识单元，可以从资料片段提取，或手动创建。确认后的卡片可被 AI 助手作为上下文参考。"
            primaryAction={{
              label: '新建卡片',
              icon: PlusIcon,
              onClick: () => setShowCreateModal(true),
            }}
            hint="卡片状态：待确认 → 已确认 / 已废弃"
          />
        ) : (
          <CardGrid
            cards={cards}
            deletingId={deletingId}
            onOpen={(c) => navigate(`/projects/${projectId}/cards/${c.id}`)}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* 新建卡片弹窗 */}
      {showCreateModal && projectId && (
        <CreateCardModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(cardId) => {
            setShowCreateModal(false)
            navigate(`/projects/${projectId}/cards/${cardId}`)
          }}
        />
      )}
    </div>
  )
}

// ============ 子组件：卡片网格 ============

type CardGridProps = {
  cards: Card[]
  deletingId: string | null
  onOpen: (card: Card) => void
  onDelete: (card: Card) => void
}

function CardGrid({ cards, deletingId, onOpen, onDelete }: CardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <CardItem
          key={card.id}
          card={card}
          deleting={deletingId === card.id}
          onOpen={() => onOpen(card)}
          onDelete={() => onDelete(card)}
        />
      ))}
    </div>
  )
}

// ============ 子组件：卡片项 ============

type CardItemProps = {
  card: Card
  deleting: boolean
  onOpen: () => void
  onDelete: () => void
}

function CardItem({ card, deleting, onOpen, onDelete }: CardItemProps) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* 头部：状态 */}
      <div className="flex items-center justify-between">
        <StatusTag
          status={card.status}
          label={CARD_STATUS_LABEL[card.status]}
        />
        <span className="text-xs text-subtle">{card.type}</span>
      </div>

      {/* 标题 */}
      <button type="button" className="text-left" onClick={onOpen}>
        <h3 className="text-base font-bold text-ink hover:text-brand transition-colors line-clamp-2">
          {card.title}
        </h3>
      </button>

      {/* 内容预览 */}
      <p className="text-sm text-muted line-clamp-4 min-h-[5rem]">
        {card.content}
      </p>

      {/* 标签 */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.tags.slice(0, 4).map((tag, idx) => (
            <span
              key={idx}
              className="tag-default"
            >
              {tag}
            </span>
          ))}
          {card.tags.length > 4 && (
            <span className="text-xs text-subtle">+{card.tags.length - 4}</span>
          )}
        </div>
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="flex items-center gap-2">
          {card.aiUsageAllowed ? (
            <StatusTag status="active" label="允许 AI" color="brand" />
          ) : (
            <StatusTag status="archived" label="禁止 AI" color="default" />
          )}
        </div>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
          onClick={onDelete}
          disabled={deleting}
          aria-label="删除卡片"
        >
          <AppIcon icon={TrashIcon} size="sm" />
        </button>
      </div>
    </div>
  )
}

// ============ 子组件：新建卡片弹窗 ============

type CreateCardModalProps = {
  projectId: string
  onClose: () => void
  onSuccess: (cardId: string) => void
}

function CreateCardModal({ projectId, onClose, onSuccess }: CreateCardModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('note')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [aiUsageAllowed, setAiUsageAllowed] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空')
      return
    }

    setSubmitting(true)
    setError(null)

    const tagList = tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)

    const result = await createCard({
      projectId,
      title: title.trim(),
      type: type.trim(),
      content,
      tags: tagList.length > 0 ? tagList : undefined,
      aiUsageAllowed,
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
      <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink">新建卡片</h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">
                标题<span className="text-danger ml-1">*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="卡片标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">类型</label>
              <input
                type="text"
                className="input"
                placeholder="例如：note / quote / concept"
                value={type}
                onChange={(e) => setType(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              内容<span className="text-danger ml-1">*</span>
            </label>
            <textarea
              className="input min-h-[200px] resize-y text-sm"
              placeholder="卡片内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">标签</label>
            <input
              type="text"
              className="input"
              placeholder="多个标签用逗号分隔"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aiUsageAllowed}
              onChange={(e) => setAiUsageAllowed(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-sm text-ink">允许 AI 助手使用此卡片作为上下文</span>
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
              {submitting ? '创建中...' : '创建卡片'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
