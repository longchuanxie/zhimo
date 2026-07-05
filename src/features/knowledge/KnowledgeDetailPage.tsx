// 知识详情页
// 对应路由：/projects/:projectId/knowledge/:knowledgeId
// 数据映射：KnowledgeService.getKnowledge + updateKnowledge + updateKnowledgeStatusService
//          + updateKnowledgeAiUsageService + updateKnowledgeConfidenceService + deleteKnowledge

import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
  TrashIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ArrowUturnUpIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { ObjectAgentResultPanel } from '@/components/agent/ObjectAgentResultPanel'
import { KnowledgeVersionChain } from '@/components/knowledge/KnowledgeVersionChain'
import { ReplaceKnowledgeModal } from '@/components/knowledge/ReplaceKnowledgeModal'
import {
  getKnowledge,
  updateKnowledge,
  updateKnowledgeStatusService,
  updateKnowledgeAiUsageService,
  updateKnowledgeConfidenceService,
  deleteKnowledge,
} from '@/services/knowledge/KnowledgeService'
import { KNOWLEDGE_STATUS_LABEL } from '@/constants/status'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_ICON,
  normalizeKnowledgeType,
} from '@/constants/knowledgeTypes'
import { useDialog } from '@/hooks/useDialog'
import { useObjectAgentCommand } from '@/hooks/useObjectAgentCommand'
import type { Knowledge, KnowledgeStatus } from '@/types'

const STATUS_ACTIONS: Array<{
  status: KnowledgeStatus
  label: string
  icon: typeof CheckIcon
}> = [
  { status: 'confirmed', label: '确认', icon: CheckIcon },
  { status: 'deprecated', label: '废弃', icon: ArchiveBoxIcon },
  { status: 'conflict', label: '标记冲突', icon: ExclamationTriangleIcon },
  { status: 'forbidden', label: '禁止使用', icon: NoSymbolIcon },
  { status: 'pending', label: '恢复待确认', icon: ArrowUturnLeftIcon },
]

export function KnowledgeDetailPage() {
  const { projectId, knowledgeId } = useParams<{
    projectId: string
    knowledgeId: string
  }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<Knowledge | null>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [confidence, setConfidence] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showReplaceModal, setShowReplaceModal] = useState(false)
  const { confirm } = useDialog()
  const { runObjectAgentCommand } = useObjectAgentCommand()

  useEffect(() => {
    if (!knowledgeId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await getKnowledge(knowledgeId!)
      if (cancelled) return

      if (result.ok) {
        setItem(result.data)
        setTitle(result.data.title)
        setType(result.data.type)
        setContent(result.data.content)
        setSummary(result.data.summary ?? '')
        setConfidence(
          result.data.confidence !== null
            ? String(result.data.confidence)
            : '',
        )
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [knowledgeId])

  const handleSave = async () => {
    if (!knowledgeId) return

    setSaving(true)
    setMsg(null)

    const result = await updateKnowledge({
      knowledgeId,
      patch: {
        title: title.trim(),
        type: type.trim(),
        content,
        summary: summary.trim(),
      },
    })

    setSaving(false)

    if (result.ok) {
      setItem(result.data)
      setEditing(false)
      setMsg('已保存')
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg(`保存失败：${result.error.message}`)
    }
  }

  const handleStatusChange = async (status: KnowledgeStatus) => {
    if (!knowledgeId) return

    setSaving(true)
    setMsg(null)
    const result = await updateKnowledgeStatusService(knowledgeId, status)
    setSaving(false)

    if (result.ok) {
      setItem(result.data)
      setMsg(`状态已更新为：${KNOWLEDGE_STATUS_LABEL[status]}`)
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg(`状态更新失败：${result.error.message}`)
    }
  }

  const handleToggleAiUsage = async () => {
    if (!knowledgeId || !item) return

    setSaving(true)
    const result = await updateKnowledgeAiUsageService(
      knowledgeId,
      !item.aiUsageAllowed,
    )
    setSaving(false)

    if (result.ok) {
      setItem(result.data)
    } else {
      setMsg(`设置更新失败：${result.error.message}`)
    }
  }

  const handleSaveConfidence = async () => {
    if (!knowledgeId) return

    const trimmed = confidence.trim()
    const value = trimmed ? Number(trimmed) : null

    if (
      value !== null &&
      (Number.isNaN(value) || value < 0 || value > 1)
    ) {
      setMsg('置信度必须是 0~1 之间的数字')
      return
    }

    setSaving(true)
    setMsg(null)
    const result = await updateKnowledgeConfidenceService(knowledgeId, value)
    setSaving(false)

    if (result.ok) {
      setItem(result.data)
      setMsg('置信度已更新')
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg(`置信度更新失败：${result.error.message}`)
    }
  }

  const handleDelete = async () => {
    if (!knowledgeId || !item) return

    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除知识「${item.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    const result = await deleteKnowledge(knowledgeId)
    if (result.ok) {
      navigate(`/projects/${projectId}/knowledge`, { replace: true })
    } else {
      setMsg(`删除失败：${result.error.message}`)
    }
  }

  const handleRunKnowledgeAgent = (
    command: 'check_knowledge_conflict' | 'revise_knowledge',
  ) => {
    if (!projectId || !item) return
    const ok = runObjectAgentCommand({
      projectId,
      command,
      objectType: 'knowledge',
      objectId: item.id,
      objectTitle: item.title,
    })
    if (ok) {
      setMsg(command === 'check_knowledge_conflict'
        ? '助手已开始检查当前知识冲突'
        : '助手已开始修订当前知识')
      setTimeout(() => setMsg(null), 2000)
    }
  }

  if (loading) {
    return <LoadingState message="正在加载知识详情..." />
  }

  if (error || !item) {
    return (
      <ErrorState
        error={{
          code: 'NOT_FOUND',
          message: error ?? '知识条目不存在',
          retryable: false,
        }}
        title="知识加载失败"
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
          onClick={() => navigate(`/projects/${projectId}/knowledge`)}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          知识库
        </button>

        <div className="h-4 w-px bg-line" />

        <StatusTag
          status={item.status}
          label={KNOWLEDGE_STATUS_LABEL[item.status]}
        />

        <div className="flex-1" />

        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunKnowledgeAgent('check_knowledge_conflict')}
        >
          <AppIcon icon={SparklesIcon} size="sm" />
          查冲突
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunKnowledgeAgent('revise_knowledge')}
        >
          助手修订
        </button>

        {/* 状态流转按钮 */}
        <div className="flex items-center gap-1">
          {STATUS_ACTIONS.map((action) => {
            if (item.status === action.status) return null
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

        {!editing && item.status !== 'deprecated' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowReplaceModal(true)}
            title="基于当前版本创建新版本，旧版本将自动标记为废弃"
          >
            <AppIcon icon={ArrowUturnUpIcon} size="sm" />
            创建新版本
          </button>
        )}

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
                    setTitle(item.title)
                    setType(item.type)
                    setContent(item.content)
                    setSummary(item.summary ?? '')
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
            <h1 className="text-2xl font-bold text-ink">{item.title}</h1>
          )}

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-subtle">
            <span>类型：{editing ? (
              <select
                className="input inline-block w-32 ml-1 py-0.5 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {KNOWLEDGE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            ) : (() => {
              const nt = normalizeKnowledgeType(item.type)
              const TypeIcon = KNOWLEDGE_TYPE_ICON[nt]
              return (
                <span className="inline-flex items-center gap-1 ml-1">
                  {TypeIcon && <AppIcon icon={TypeIcon} size="sm" />}
                  {KNOWLEDGE_TYPE_LABEL[nt]}
                </span>
              )
            })()}</span>
            <span>·</span>
            <span>版本 v{item.version}</span>
            <span>·</span>
            <span>创建于 {item.createdAt.slice(0, 10)}</span>
            <span>·</span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                item.aiUsageAllowed ? 'bg-brand' : 'bg-line'
              }`}
              onClick={handleToggleAiUsage}
              disabled={saving}
              role="switch"
              aria-checked={item.aiUsageAllowed}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  item.aiUsageAllowed ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span>{item.aiUsageAllowed ? '允许 AI 使用' : '禁止 AI 使用'}</span>
          </div>

          {/* 摘要 */}
          {editing ? (
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
          ) : (
            item.summary && (
              <div className="rounded-md bg-brand-soft border border-brand/20 px-4 py-3">
                <p className="text-sm text-brand leading-relaxed">{item.summary}</p>
              </div>
            )
          )}

          {projectId && (
            <ObjectAgentResultPanel
              projectId={projectId}
              objectType="knowledge"
              objectId={item.id}
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
                {item.content}
              </p>
            </div>
          )}

          {/* 置信度 */}
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">置信度</h3>
              {item.confidence !== null && (
                <span className="text-sm text-muted">
                  当前：{(item.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="0~1 之间的数字，例如 0.85"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                disabled={saving}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveConfidence}
                disabled={saving}
              >
                更新
              </button>
            </div>
          </div>

          {/* 来源信息 */}
          {(item.sourceType || item.sourceId) && (
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink mb-2">来源</h3>
              <div className="space-y-1 text-xs text-subtle">
                {item.sourceType && (
                  <div>来源类型：{item.sourceType}</div>
                )}
                {item.sourceId && (
                  <div>来源 ID：{item.sourceId}</div>
                )}
              </div>
            </div>
          )}

          {/* 版本演进链路 */}
          <KnowledgeVersionChain current={item} projectId={projectId!} />
        </div>
      </div>

      {/* 创建新版本弹窗 */}
      <ReplaceKnowledgeModal
        oldKnowledge={item}
        open={showReplaceModal}
        onClose={() => setShowReplaceModal(false)}
        onReplaced={(newId) => {
          setShowReplaceModal(false)
          navigate(`/projects/${projectId}/knowledge/${newId}`)
        }}
      />
    </div>
  )
}
