// 卡片详情页
// 对应路由：/projects/:projectId/cards/:cardId
// 数据映射：CardService.getCard + updateCard + updateCardStatusService + deleteCard

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
  TrashIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { ObjectAgentResultPanel } from '@/components/agent/ObjectAgentResultPanel'
import {
  getCard,
  updateCard,
  updateCardStatusService,
  updateCardAiUsageService,
  deleteCard,
} from '@/services/card/CardService'
import { CARD_STATUS_LABEL } from '@/constants/status'
import { useDialog } from '@/hooks/useDialog'
import { useObjectAgentCommand } from '@/hooks/useObjectAgentCommand'
import type { Card, CardStatus } from '@/types'

const STATUS_ACTIONS: Array<{
  status: CardStatus
  label: string
  icon: typeof CheckIcon
}> = [
  { status: 'confirmed', label: '确认', icon: CheckIcon },
  { status: 'deprecated', label: '废弃', icon: ArchiveBoxIcon },
  { status: 'pending', label: '恢复待确认', icon: ArrowUturnLeftIcon },
]

export function CardDetailPage() {
  const { projectId, cardId } = useParams<{
    projectId: string
    cardId: string
  }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [card, setCard] = useState<Card | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { confirm } = useDialog()
  const { runObjectAgentCommand } = useObjectAgentCommand()

  useEffect(() => {
    if (!cardId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await getCard(cardId!)
      if (cancelled) return

      if (result.ok) {
        setCard(result.data)
        setTitle(result.data.title)
        setContent(result.data.content)
        setSummary(result.data.summary ?? '')
        setTags(result.data.tags?.join(', ') ?? '')
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cardId])

  const handleSave = async () => {
    if (!cardId) return

    setSaving(true)
    setMsg(null)

    const tagList = tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)

    const result = await updateCard({
      cardId,
      patch: {
        title: title.trim(),
        content,
        summary: summary.trim(),
        tags: tagList,
      },
    })

    setSaving(false)

    if (result.ok) {
      setCard(result.data)
      setEditing(false)
      setMsg('已保存')
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg(`保存失败：${result.error.message}`)
    }
  }

  const handleStatusChange = async (status: CardStatus) => {
    if (!cardId) return

    setSaving(true)
    setMsg(null)
    const result = await updateCardStatusService(cardId, status)
    setSaving(false)

    if (result.ok) {
      setCard(result.data)
      setMsg(`状态已更新为：${CARD_STATUS_LABEL[status]}`)
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg(`状态更新失败：${result.error.message}`)
    }
  }

  const handleToggleAiUsage = async () => {
    if (!cardId || !card) return

    setSaving(true)
    const result = await updateCardAiUsageService(cardId, !card.aiUsageAllowed)
    setSaving(false)

    if (result.ok) {
      setCard(result.data)
    } else {
      setMsg(`设置更新失败：${result.error.message}`)
    }
  }

  const handleDelete = async () => {
    if (!cardId || !card) return

    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除卡片「${card.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    const result = await deleteCard(cardId)
    if (result.ok) {
      navigate(`/projects/${projectId}/cards`, { replace: true })
    } else {
      setMsg(`删除失败：${result.error.message}`)
    }
  }

  const handleRunCardAgent = (
    command: 'expand_card' | 'turn_card_into_knowledge',
  ) => {
    if (!projectId || !card) return
    const ok = runObjectAgentCommand({
      projectId,
      command,
      objectType: 'card',
      objectId: card.id,
      objectTitle: card.title,
    })
    if (ok) {
      setMsg(command === 'expand_card'
        ? '助手已开始扩展当前卡片'
        : '助手已开始判断是否沉淀为知识')
      setTimeout(() => setMsg(null), 2000)
    }
  }

  if (loading) {
    return <LoadingState message="正在加载卡片详情..." />
  }

  if (error || !card) {
    return (
      <ErrorState
        error={{
          code: 'NOT_FOUND',
          message: error ?? '卡片不存在',
          retryable: false,
        }}
        title="卡片加载失败"
      />
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate(`/projects/${projectId}/cards`)}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          卡片列表
        </button>

        <div className="h-4 w-px bg-line" />

        <StatusTag
          status={card.status}
          label={CARD_STATUS_LABEL[card.status]}
        />

        <div className="flex-1" />

        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunCardAgent('expand_card')}
        >
          <AppIcon icon={SparklesIcon} size="sm" />
          助手扩展
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunCardAgent('turn_card_into_knowledge')}
        >
          转为知识
        </button>

        {/* 状态流转按钮 */}
        <div className="flex items-center gap-1">
          {STATUS_ACTIONS.map((action) => {
            if (card.status === action.status) return null
            return (
              <button
                key={action.status}
                type="button"
                className="btn-secondary"
                onClick={() => handleStatusChange(action.status)}
                disabled={saving}
              >
                <AppIcon icon={action.icon} size="sm" />
                {action.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="btn-ghost text-danger hover:bg-danger-soft"
          onClick={handleDelete}
        >
          <AppIcon icon={TrashIcon} size="sm" />
          删除
        </button>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div className="mx-6 mt-3 rounded-md bg-brand-soft border border-brand/20 px-4 py-2">
          <p className="text-sm text-brand">{msg}</p>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          {/* 编辑/查看切换 */}
          <div className="flex items-center justify-end">
            {editing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTitle(card.title)
                    setContent(card.content)
                    setSummary(card.summary ?? '')
                    setTags(card.tags?.join(', ') ?? '')
                    setEditing(false)
                  }}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving || !title.trim() || !content.trim()}
                >
                  <AppIcon icon={CheckIcon} size="sm" />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(true)}
              >
                编辑
              </button>
            )}
          </div>

          {/* 标题 */}
          {editing ? (
            <input
              type="text"
              className="input text-lg font-bold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          ) : (
            <h1 className="text-2xl font-bold text-ink">{card.title}</h1>
          )}

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-subtle">
            <span>类型：{card.type}</span>
            <span>·</span>
            <span>创建于 {card.createdAt.slice(0, 10)}</span>
            <span>·</span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                card.aiUsageAllowed ? 'bg-brand' : 'bg-line'
              }`}
              onClick={handleToggleAiUsage}
              disabled={saving}
              role="switch"
              aria-checked={card.aiUsageAllowed}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  card.aiUsageAllowed ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span>{card.aiUsageAllowed ? '允许 AI 使用' : '禁止 AI 使用'}</span>
          </div>

          {/* 标签 */}
          {editing ? (
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
          ) : (
            card.tags && card.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {card.tags.map((tag, idx) => (
                  <StatusTag key={idx} status="active" label={tag} color="info" />
                ))}
              </div>
            )
          )}

          {/* 摘要 */}
          {editing ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">摘要</label>
              <textarea
                className="input min-h-[60px] resize-none"
                placeholder="一句话概括卡片内容"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={200}
              />
            </div>
          ) : (
            card.summary && (
              <div className="rounded-md bg-brand-soft border border-brand/20 px-4 py-3">
                <p className="text-sm text-brand leading-relaxed">{card.summary}</p>
              </div>
            )
          )}

          {projectId && (
            <ObjectAgentResultPanel
              projectId={projectId}
              objectType="card"
              objectId={card.id}
            />
          )}

          {/* 内容 */}
          {editing ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">内容</label>
              <textarea
                className="input min-h-[300px] resize-y text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          ) : (
            <div className="card p-5">
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                {card.content}
              </p>
            </div>
          )}

          {/* 来源信息 */}
          {(card.sourceId || card.sourceDocumentId) && (
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink mb-2">来源</h3>
              <div className="space-y-1 text-xs text-subtle">
                {card.sourceId && (
                  <div>来源资料 ID：{card.sourceId}</div>
                )}
                {card.sourceChunkId && (
                  <div>来源片段 ID：{card.sourceChunkId}</div>
                )}
                {card.sourceDocumentId && (
                  <div>来源文档 ID：{card.sourceDocumentId}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
