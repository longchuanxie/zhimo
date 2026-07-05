// 资料详情页
// 对应路由：/projects/:projectId/sources/:sourceId
// 数据映射：SourceService.getSourceDetail + updateSourceSettings + reparseSource

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { ObjectAgentResultPanel } from '@/components/agent/ObjectAgentResultPanel'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import { useObjectAgentCommand } from '@/hooks/useObjectAgentCommand'
import {
  getSourceDetail,
  updateSourceSettings,
  reparseSource,
  deleteSource,
} from '@/services/source/SourceService'
import {
  SOURCE_PROCESSING_STATUS_LABEL,
  SOURCE_TYPE_LABEL,
  SOURCE_STATUS_LABEL,
} from '@/constants/status'
import { SOURCE_OCR_REQUIRED, getSuggestedAction } from '@/constants/errors'
import { KnowledgeExtractModal } from '@/components/knowledge/KnowledgeExtractModal'
import type { SourceDetail } from '@/services/source/SourceService'

export function SourceDetailPage() {
  const { projectId, sourceId } = useParams<{
    projectId: string
    sourceId: string
  }>()
  const navigate = useNavigate()

  const { state, refresh } = useAsync<SourceDetail>(
    () => getSourceDetail(sourceId!),
    [sourceId],
    { enabled: !!sourceId },
  )
  const { confirm } = useDialog()
  const { runObjectAgentCommand } = useObjectAgentCommand()

  const [titleEditing, setTitleEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showExtractModal, setShowExtractModal] = useState(false)

  const handleTitleSave = async () => {
    if (!sourceId || !state || state.status !== 'success') return
    const currentTitle = state.data.source.title
    if (!title.trim() || title.trim() === currentTitle) {
      setTitle(currentTitle)
      setTitleEditing(false)
      return
    }

    setSaving(true)
    const result = await updateSourceSettings({
      sourceId,
      title: title.trim(),
    })
    setSaving(false)

    if (result.ok) {
      setTitleEditing(false)
      refresh()
    } else {
      setMsg(`标题保存失败：${result.error.message}`)
    }
  }

  const handleToggleAiUsage = async () => {
    if (!sourceId || !state || state.status !== 'success') return
    const currentValue = state.data.source.aiUsageAllowed

    setSaving(true)
    const result = await updateSourceSettings({
      sourceId,
      aiUsageAllowed: !currentValue,
    })
    setSaving(false)

    if (result.ok) {
      refresh()
    } else {
      setMsg(`设置更新失败：${result.error.message}`)
    }
  }

  const handleToggleStatus = async () => {
    if (!sourceId || !state || state.status !== 'success') return
    const currentStatus = state.data.source.sourceStatus
    const newStatus = currentStatus === 'active' ? 'archived' : 'active'

    setSaving(true)
    const result = await updateSourceSettings({
      sourceId,
      sourceStatus: newStatus,
    })
    setSaving(false)

    if (result.ok) {
      refresh()
    } else {
      setMsg(`状态更新失败：${result.error.message}`)
    }
  }

  const handleReparse = async () => {
    if (!sourceId) return
    setReparsing(true)
    setMsg(null)
    const result = await reparseSource(sourceId)
    setReparsing(false)

    if (result.ok) {
      setMsg('已重新解析')
      refresh()
    } else {
      setMsg(`解析失败：${result.error.message}`)
    }
  }

  const handleDelete = async () => {
    if (!sourceId || !state || state.status !== 'success') return
    const sourceTitle = state.data.source.title

    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除资料「${sourceTitle}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    const result = await deleteSource(sourceId)
    if (result.ok) {
      navigate(`/projects/${projectId}/sources`, { replace: true })
    } else {
      setMsg(`删除失败：${result.error.message}`)
    }
  }

  const handleRunSourceAgent = (
    command: 'extract_cards_from_source' | 'check_source_evidence',
  ) => {
    if (!projectId || !sourceId || state.status !== 'success') return
    const ok = runObjectAgentCommand({
      projectId,
      command,
      objectType: 'source',
      objectId: sourceId,
      objectTitle: state.data.source.title,
    })
    if (ok) {
      setMsg(command === 'extract_cards_from_source'
        ? '助手已开始从当前资料提炼卡片'
        : '助手已开始检查当前资料的证据价值')
      setTimeout(() => setMsg(null), 2000)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载资料详情..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="资料加载失败" />
  }

  const { source, chunks } = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate(`/projects/${projectId}/sources`)}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          资料列表
        </button>

        <div className="h-4 w-px bg-line" />

        {/* 标题编辑 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {titleEditing ? (
            <input
              type="text"
              className="input flex-1 max-w-md"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave()
                else if (e.key === 'Escape') {
                  setTitle(source.title)
                  setTitleEditing(false)
                }
              }}
              autoFocus
              disabled={saving}
              maxLength={200}
            />
          ) : (
            <button
              type="button"
              className="text-sm font-semibold text-ink hover:text-brand transition-colors truncate"
              onClick={() => {
                setTitle(source.title)
                setTitleEditing(true)
              }}
              title="点击编辑标题"
            >
              {source.title}
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleReparse}
          disabled={reparsing}
        >
          <AppIcon icon={ArrowPathIcon} size="sm" />
          {reparsing ? '解析中...' : '重新解析'}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowExtractModal(true)}
          disabled={!source.rawText && chunks.length === 0}
          title="从资料内容中提取知识草稿"
        >
          <AppIcon icon={SparklesIcon} size="sm" />
          提取知识
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunSourceAgent('extract_cards_from_source')}
          disabled={!source.rawText && chunks.length === 0}
        >
          <AppIcon icon={SparklesIcon} size="sm" />
          助手提卡
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRunSourceAgent('check_source_evidence')}
          disabled={!source.rawText && chunks.length === 0}
        >
          核查证据
        </button>
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
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* 元信息卡片 */}
          <div className="card p-5">
            <h2 className="text-base font-bold text-ink mb-4">资料信息</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="类型" value={SOURCE_TYPE_LABEL[source.type] ?? source.type} />
              <InfoItem
                label="处理状态"
                value={SOURCE_PROCESSING_STATUS_LABEL[source.processingStatus]}
              />
              <InfoItem
                label="资料状态"
                value={SOURCE_STATUS_LABEL[source.sourceStatus]}
              />
              <InfoItem
                label="文件大小"
                value={source.fileSize ? `${source.fileSize.toLocaleString()} 字符` : '—'}
              />
              {source.fileName && (
                <InfoItem label="文件名" value={source.fileName} />
              )}
              <InfoItem
                label="创建时间"
                value={source.createdAt.slice(0, 10)}
              />
            </div>

            {/* 错误信息 */}
            {source.errorMessage && (
              <div className="mt-4 rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
                <p className="text-sm text-danger">
                  {source.errorMessage.includes(SOURCE_OCR_REQUIRED)
                    ? '检测到扫描版 PDF,暂不支持 OCR 识别'
                    : `解析错误：${source.errorMessage}`}
                </p>
                {source.errorMessage.includes(SOURCE_OCR_REQUIRED) && (
                  <p className="text-xs text-muted mt-1">
                    {getSuggestedAction(SOURCE_OCR_REQUIRED)}
                  </p>
                )}
              </div>
            )}

            {/* 权限控制 */}
            <div className="mt-4 pt-4 border-t border-line space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">允许 AI 使用</div>
                  <p className="text-xs text-subtle">
                    开启后，AI 助手可将此资料作为上下文参考
                  </p>
                </div>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    source.aiUsageAllowed ? 'bg-brand' : 'bg-line'
                  }`}
                  onClick={handleToggleAiUsage}
                  disabled={saving}
                  role="switch"
                  aria-checked={source.aiUsageAllowed}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      source.aiUsageAllowed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">资料状态</div>
                  <p className="text-xs text-subtle">
                    归档后的资料不会被 AI 使用
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleToggleStatus}
                  disabled={saving}
                >
                  {source.sourceStatus === 'active' ? '归档' : '恢复可用'}
                </button>
              </div>
            </div>
          </div>

          {/* 摘要 */}
          {source.summaryShort && (
            <div className="card p-5">
              <h2 className="text-base font-bold text-ink mb-3">摘要</h2>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                {source.summaryShort}
              </p>
            </div>
          )}

          {projectId && (
            <ObjectAgentResultPanel
              projectId={projectId}
              objectType="source"
              objectId={source.id}
            />
          )}

          {/* 关键词 */}
          {source.keywords && source.keywords.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-bold text-ink mb-3">关键词</h2>
              <div className="flex flex-wrap gap-2">
                {source.keywords.map((kw, idx) => (
                  <StatusTag key={idx} status="active" label={kw} color="info" />
                ))}
              </div>
            </div>
          )}

          {/* 资料片段 */}
          {chunks.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-bold text-ink mb-3">
                资料片段（{chunks.length} 片）
              </h2>
              <div className="space-y-3 max-h-96 overflow-auto">
                {chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-md border border-line bg-surface-2/50 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-subtle">
                        片段 #{chunk.chunkIndex + 1}
                      </span>
                      <span className="text-xs text-subtle">
                        约 {chunk.tokenCount} tokens
                      </span>
                    </div>
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 原文 */}
          {source.rawText && (
            <div className="card p-5">
              <h2 className="text-base font-bold text-ink mb-3">原文内容</h2>
              <pre className="text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans max-h-[500px] overflow-auto">
                {source.rawText}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 提取知识弹窗 */}
      {showExtractModal && projectId && sourceId && (
        <KnowledgeExtractModal
          projectId={projectId}
          sourceId={sourceId}
          sourceTitle={source.title}
          sourceContent={source.rawText ?? chunks.map((c) => c.content).join('\n\n')}
          onClose={() => setShowExtractModal(false)}
          onSuccess={() => setShowExtractModal(false)}
        />
      )}
    </div>
  )
}

// ============ 子组件：信息项 ============

type InfoItemProps = {
  label: string
  value: string
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <div className="text-xs font-semibold text-subtle mb-1">{label}</div>
      <div className="text-sm text-ink truncate" title={value}>
        {value}
      </div>
    </div>
  )
}
