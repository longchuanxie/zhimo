// 资料库列表页
// 对应路由：/projects/:projectId/sources
// 数据映射：SourceService.listSources + importFile + createTextSource + deleteSource

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArchiveBoxIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  TrashIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import {
  listSources,
  importFile,
  createTextSource,
  deleteSource,
} from '@/services/source/SourceService'
import {
  SOURCE_PROCESSING_STATUS_LABEL,
  SOURCE_TYPE_LABEL,
  SOURCE_STATUS_LABEL,
} from '@/constants/status'
import { getSuggestedAction } from '@/constants/errors'
import type { Source } from '@/types'

export function SourceListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorInfo, setErrorInfo] = useState<{ message: string; action?: string } | null>(null)

  const { state, refresh } = useAsync<Source[]>(
    () => listSources(projectId!),
    [projectId],
    { enabled: !!projectId },
  )
  const { confirm } = useDialog()

  const handleImportFile = async () => {
    if (!projectId) return
    setImporting(true)
    setErrorInfo(null)
    const result = await importFile({ projectId })
    setImporting(false)

    if (result.ok) {
      refresh()
    } else if (result.error.code !== 'OPERATION_CANCELLED') {
      setErrorInfo({
        message: result.error.message,
        action: getSuggestedAction(result.error.code),
      })
    }
  }

  const handleDelete = async (source: Source) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除资料「${source.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(source.id)
    const result = await deleteSource(source.id)
    setDeletingId(null)

    if (result.ok) {
      refresh()
    } else {
      setErrorInfo({
        message: result.error.message,
        action: getSuggestedAction(result.error.code),
      })
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载资料列表..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="资料列表加载失败" />
  }

  const sources = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">资料库</h1>
          <p className="text-sm text-muted mt-1">
            共 {sources.length} 份资料。导入的文件会保存在本地，解析后可用于 AI 上下文。
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
            onClick={() => setShowPasteModal(true)}
          >
            <AppIcon icon={ClipboardDocumentIcon} size="sm" />
            粘贴文本
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleImportFile}
            disabled={importing}
          >
            <AppIcon icon={ArrowUpTrayIcon} size="sm" />
            {importing ? '导入中...' : '导入文件'}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {errorInfo && (
        <div className="mx-8 mt-4 rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-danger">{errorInfo.message}</p>
              {errorInfo.action && (
                <p className="text-xs text-muted mt-1">{errorInfo.action}</p>
              )}
            </div>
            <button
              type="button"
              className="text-danger hover:opacity-70 shrink-0"
              onClick={() => setErrorInfo(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {sources.length === 0 ? (
          <EmptyState
            icon={ArchiveBoxIcon}
            title="还没有资料"
            description="导入 TXT / Markdown / PDF / Word 文件，或直接粘贴文本创建资料。资料解析后会自动分片，可用于 AI 上下文参考。"
            primaryAction={{
              label: '导入文件',
              icon: ArrowUpTrayIcon,
              onClick: handleImportFile,
            }}
            secondaryAction={{
              label: '粘贴文本',
              icon: ClipboardDocumentIcon,
              onClick: () => setShowPasteModal(true),
            }}
            hint="支持文本型 PDF 和 Word 文档。扫描版 PDF 暂不支持 OCR,可转为文本型后导入。"
          />
        ) : (
          <SourceGrid
            sources={sources}
            deletingId={deletingId}
            onOpen={(s) => navigate(`/projects/${projectId}/sources/${s.id}`)}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* 粘贴文本弹窗 */}
      {showPasteModal && projectId && (
        <PasteTextModal
          onClose={() => setShowPasteModal(false)}
          onSuccess={() => {
            setShowPasteModal(false)
            refresh()
          }}
          projectId={projectId}
        />
      )}
    </div>
  )
}

// ============ 子组件：资料卡片网格 ============

type SourceGridProps = {
  sources: Source[]
  deletingId: string | null
  onOpen: (source: Source) => void
  onDelete: (source: Source) => void
}

function SourceGrid({ sources, deletingId, onOpen, onDelete }: SourceGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          deleting={deletingId === source.id}
          onOpen={() => onOpen(source)}
          onDelete={() => onDelete(source)}
        />
      ))}
    </div>
  )
}

// ============ 子组件：资料卡片 ============

type SourceCardProps = {
  source: Source
  deleting: boolean
  onOpen: () => void
  onDelete: () => void
}

function SourceCard({ source, deleting, onOpen, onDelete }: SourceCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* 头部：类型 + 状态 */}
      <div className="flex items-center justify-between">
        <StatusTag
          status={source.type}
          label={SOURCE_TYPE_LABEL[source.type] ?? source.type}
          color="accent"
        />
        <StatusTag
          status={source.processingStatus}
          label={SOURCE_PROCESSING_STATUS_LABEL[source.processingStatus]}
        />
      </div>

      {/* 标题 */}
      <button type="button" className="text-left" onClick={onOpen}>
        <h3 className="text-base font-bold text-ink hover:text-brand transition-colors line-clamp-2">
          {source.title}
        </h3>
      </button>

      {/* 摘要或原文预览 */}
      <p className="text-sm text-muted line-clamp-3 min-h-[3.75rem]">
        {source.summaryShort || source.rawText?.slice(0, 120) || '暂无内容'}
      </p>

      {/* 底部信息 */}
      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="flex items-center gap-2">
          {source.aiUsageAllowed ? (
            <StatusTag status="active" label="允许 AI" color="brand" />
          ) : (
            <StatusTag status="archived" label="禁止 AI" color="default" />
          )}
          <StatusTag
            status={source.sourceStatus}
            label={SOURCE_STATUS_LABEL[source.sourceStatus]}
          />
        </div>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
          onClick={onDelete}
          disabled={deleting}
          aria-label="删除资料"
        >
          <AppIcon icon={TrashIcon} size="sm" />
        </button>
      </div>
    </div>
  )
}

// ============ 子组件：粘贴文本弹窗 ============

type PasteTextModalProps = {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

function PasteTextModal({ projectId, onClose, onSuccess }: PasteTextModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
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

    const result = await createTextSource({
      projectId,
      title: title.trim(),
      content,
      aiUsageAllowed,
    })

    setSubmitting(false)

    if (result.ok) {
      onSuccess()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink">粘贴文本创建资料</h2>
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
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              标题<span className="text-danger ml-1">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="给这份资料起个名字"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              内容<span className="text-danger ml-1">*</span>
            </label>
            <textarea
              className="input min-h-[240px] resize-y font-mono text-sm"
              placeholder="粘贴文本内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aiUsageAllowed}
              onChange={(e) => setAiUsageAllowed(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-sm text-ink">允许 AI 助手使用此资料作为上下文</span>
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
              <AppIcon icon={DocumentTextIcon} size="sm" />
              {submitting ? '创建中...' : '创建资料'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
