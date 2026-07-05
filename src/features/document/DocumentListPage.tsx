// 文档列表页
// 对应路由：/projects/:projectId/documents
// 数据映射：DocumentService.listDocuments + DocumentService.createDocument + DocumentService.deleteDocument

import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  DocumentTextIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import {
  listDocuments,
  createDocument,
  deleteDocument,
  updateDocumentStatusService,
} from '@/services/document/DocumentService'
import { DOCUMENT_STATUS_LABEL } from '@/constants/status'
import {
  APP_EVENTS,
  type DocumentCreatedDetail,
} from '@/constants/events'
import { toast } from '@/stores/toastStore'
import type { Document, DocumentStatus } from '@/types'

export function DocumentListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const { state, refresh } = useAsync<Document[]>(
    () => listDocuments(projectId!),
    [projectId],
    { enabled: !!projectId },
  )
  const { confirm, prompt } = useDialog()

  useEffect(() => {
    const handleDocumentCreated = (event: Event) => {
      const detail = (event as CustomEvent<DocumentCreatedDetail>).detail
      if (!detail?.projectId || detail.projectId === projectId) {
        refresh()
      }
    }

    window.addEventListener(APP_EVENTS.documentCreated, handleDocumentCreated)
    return () => {
      window.removeEventListener(APP_EVENTS.documentCreated, handleDocumentCreated)
    }
  }, [projectId, refresh])

  const handleCreate = async () => {
    if (!projectId) return
    const title = await prompt({
      title: '请输入文档标题',
      defaultValue: '未命名文档',
    })
    if (!title || !title.trim()) return

    setCreating(true)
    const result = await createDocument({
      projectId,
      title: title.trim(),
    })
    setCreating(false)

    if (result.ok) {
      navigate(`/projects/${projectId}/documents/${result.data.id}`)
    } else {
      toast.error(`创建失败：${result.error.message}`)
    }
  }

  const handleDelete = async (doc: Document) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除文档「${doc.title}」吗？文档内容将保留在本地数据库，但不会显示在列表中。`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(doc.id)
    const result = await deleteDocument(doc.id)
    setDeletingId(null)

    if (result.ok) {
      refresh()
    } else {
      toast.error(`删除失败：${result.error.message}`)
    }
  }

  const handleStatusChange = async (doc: Document, newStatus: DocumentStatus) => {
    if (newStatus === doc.status) return

    setUpdatingStatusId(doc.id)
    const result = await updateDocumentStatusService(doc.id, newStatus)
    setUpdatingStatusId(null)

    if (result.ok) {
      refresh()
    } else {
      toast.error(`状态更新失败：${result.error.message}`)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载文档列表..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="文档列表加载失败" />
  }

  const documents = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">文档</h1>
          <p className="text-sm text-muted mt-1">
            共 {documents.length} 篇文档，点击进入编辑。
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
            onClick={handleCreate}
            disabled={creating}
          >
            <AppIcon icon={PlusIcon} size="sm" />
            {creating ? '创建中...' : '新建文档'}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {documents.length === 0 ? (
          <EmptyState
            icon={DocumentTextIcon}
            title="还没有文档"
            description="新建一篇文档开始写作。编辑器支持标题、列表、引用等格式，内容会自动保存到本地。"
            primaryAction={{
              label: '新建文档',
              icon: PlusIcon,
              onClick: handleCreate,
            }}
            hint="TipTap 富文本编辑器支持 content_json + plain_text 双存储。"
          />
        ) : (
          <DocumentTable
            documents={documents}
            deletingId={deletingId}
            updatingStatusId={updatingStatusId}
            onOpen={(doc) =>
              navigate(`/projects/${projectId}/documents/${doc.id}`)
            }
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </div>
  )
}

// ============ 子组件：文档表格 ============

type DocumentTableProps = {
  documents: Document[]
  deletingId: string | null
  updatingStatusId: string | null
  onOpen: (doc: Document) => void
  onDelete: (doc: Document) => void
  onStatusChange: (doc: Document, newStatus: DocumentStatus) => void
}

function DocumentTable({
  documents,
  deletingId,
  updatingStatusId,
  onOpen,
  onDelete,
  onStatusChange,
}: DocumentTableProps) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-surface-2/50">
            <th className="text-left text-xs font-semibold text-subtle px-4 py-3">
              标题
            </th>
            <th className="text-left text-xs font-semibold text-subtle px-4 py-3 w-24">
              状态
            </th>
            <th className="text-right text-xs font-semibold text-subtle px-4 py-3 w-28">
              字数
            </th>
            <th className="text-left text-xs font-semibold text-subtle px-4 py-3 w-32">
              最后编辑
            </th>
            <th className="w-16 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              deleting={deletingId === doc.id}
              updatingStatus={updatingStatusId === doc.id}
              onOpen={() => onOpen(doc)}
              onDelete={() => onDelete(doc)}
              onStatusChange={(newStatus) => onStatusChange(doc, newStatus)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============ 子组件：文档行 ============

type DocumentRowProps = {
  doc: Document
  deleting: boolean
  updatingStatus: boolean
  onOpen: () => void
  onDelete: () => void
  onStatusChange: (newStatus: DocumentStatus) => void
}

const DOCUMENT_STATUS_OPTIONS: DocumentStatus[] = [
  'draft',
  'writing',
  'reviewing',
  'completed',
  'archived',
]

function DocumentRow({
  doc,
  deleting,
  updatingStatus,
  onOpen,
  onDelete,
  onStatusChange,
}: DocumentRowProps) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-2/50 transition-colors">
      <td className="px-4 py-3">
        <button
          type="button"
          className="text-left"
          onClick={onOpen}
        >
          <div className="flex items-center gap-2">
            <AppIcon icon={DocumentTextIcon} size="sm" className="text-muted" />
            <span className="text-sm font-medium text-ink hover:text-brand transition-colors">
              {doc.title}
            </span>
          </div>
          {doc.summary && (
            <p className="text-xs text-subtle mt-1 ml-6 line-clamp-1">
              {doc.summary}
            </p>
          )}
        </button>
      </td>
      <td className="px-4 py-3">
        <select
          value={doc.status}
          disabled={updatingStatus}
          onChange={(e) => onStatusChange(e.target.value as DocumentStatus)}
          className="text-xs rounded-md border border-line bg-surface px-2 py-1 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="文档状态"
        >
          {DOCUMENT_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {DOCUMENT_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right text-sm text-muted">
        {doc.wordCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-sm text-subtle">
        {doc.lastEditedAt ? formatDate(doc.lastEditedAt) : '—'}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
          onClick={onDelete}
          disabled={deleting}
          aria-label="删除文档"
        >
          <AppIcon icon={TrashIcon} size="sm" />
        </button>
      </td>
    </tr>
  )
}

/// 格式化日期为 YYYY-MM-DD
function formatDate(iso: string): string {
  try {
    return iso.slice(0, 10)
  } catch {
    return iso
  }
}
