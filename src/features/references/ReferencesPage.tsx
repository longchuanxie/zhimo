// 参考文献管理页
// 对应路由：/projects/:projectId/references
// 对应任务：C.4 参考文献管理
//
// 职责：
// - 展示项目参考文献列表（citationKey/title/authors/year/entryType/sourceId）
// - 新建/编辑参考文献（打开 ReferenceFormModal）
// - 从资料导入（打开 SourcePickerModal，调用 importFromSource）
// - 删除参考文献（带 citationCount 警告）
//
// 架构约束：
// - 通过 ReferenceService 访问数据
// - 复用 KnowledgeListPage 的列表+创建+删除模式

import { useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  BookOpenIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import {
  listReferences,
  deleteReference,
  importFromSource,
} from '@/services/citation/ReferenceService'
import { REFERENCE_ENTRY_TYPE_LABEL } from '@/constants/status'
import { NAV_LABELS } from '@/constants/objectLabels'
import { toast } from '@/stores/toastStore'
import { SourcePickerModal } from '@/components/source/SourcePickerModal'
import { ReferenceFormModal } from './ReferenceFormModal'
import type { Reference, Source } from '@/types'

export function ReferencesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingReference, setEditingReference] = useState<Reference | null>(null)
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const { state, refresh } = useAsync<Reference[]>(
    () => listReferences(projectId!),
    [projectId],
    { enabled: !!projectId },
  )
  const { confirm } = useDialog()

  const handleCreate = () => {
    setEditingReference(null)
    setShowFormModal(true)
  }

  const handleEdit = (reference: Reference) => {
    setEditingReference(reference)
    setShowFormModal(true)
  }

  const handleDelete = async (reference: Reference) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除参考文献「${reference.title}」吗？若该文献被引文引用，删除后引文将变为悬空，可能阻断导出。`,
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(reference.id)
    const result = await deleteReference(reference.id)
    setDeletingId(null)

    if (result.ok) {
      toast.success('参考文献已删除')
      if (result.data.citationCount > 0) {
        toast.info(`该文献被 ${result.data.citationCount} 处引文引用，已变为悬空`)
      }
      refresh()
    } else {
      toast.error(`删除失败：${result.error.message}`)
    }
  }

  const handleImportFromSource = async (source: Source | null) => {
    if (!source) {
      toast.info('未选择资料，已取消导入')
      return
    }
    setImporting(true)
    const result = await importFromSource(source.id)
    setImporting(false)

    if (result.ok) {
      toast.success(`已从资料「${source.title}」生成参考文献`)
      refresh()
    } else {
      toast.error(`导入失败：${result.error.message}`)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载参考文献..." />
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        error={state.error}
        onRetry={refresh}
        title="参考文献加载失败"
      />
    )
  }

  const references = state.data

  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-line">
        <div className="flex items-center gap-2">
          <AppIcon icon={BookOpenIcon} size="sm" className="text-brand" />
          <h1 className="text-base font-bold text-ink">{NAV_LABELS.references}</h1>
          {references.length > 0 && (
            <span className="text-xs text-subtle">（共 {references.length} 条）</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 flex items-center gap-1"
            onClick={() => setShowSourcePicker(true)}
            disabled={importing}
          >
            <AppIcon icon={ArrowDownTrayIcon} size="sm" />
            {importing ? '导入中...' : '从资料导入'}
          </button>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 flex items-center gap-1"
            onClick={handleCreate}
          >
            <AppIcon icon={PlusIcon} size="sm" />
            新建参考文献
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6">
        {references.length === 0 ? (
          <EmptyState
            icon={BookOpenIcon}
            title="还没有参考文献"
            description="新建参考文献，或从已导入资料自动生成（需资料已提取书目元数据）。"
            primaryAction={{
              label: '新建参考文献',
              icon: PlusIcon,
              onClick: handleCreate,
            }}
            hint="参考文献用于论文引文标注，是材料真实性的核心保障"
          />
        ) : (
          <div className="space-y-2 max-w-4xl">
            {references.map((reference) => {
              const authorsText =
                reference.authors.length > 3
                  ? `${reference.authors.slice(0, 3).map((a) => a.name).join(', ')}, 等`
                  : reference.authors.map((a) => a.name).join(', ')
              return (
                <div
                  key={reference.id}
                  className="flex items-start gap-3 p-4 bg-surface border border-line rounded-md hover:border-brand/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    {/* 第一行：citationKey + entryType + sourceId */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <code className="text-xs font-mono text-brand bg-brand-soft/40 px-1.5 py-0.5 rounded">
                        {reference.citationKey}
                      </code>
                      <span className="text-xs text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                        {REFERENCE_ENTRY_TYPE_LABEL[reference.entryType]}
                      </span>
                      {reference.sourceId && (
                        <span className="text-xs text-success bg-success-soft/30 px-1.5 py-0.5 rounded">
                          已关联资料
                        </span>
                      )}
                      {reference.year && (
                        <span className="text-xs text-subtle">{reference.year}</span>
                      )}
                    </div>
                    {/* 第二行：title */}
                    <button
                      type="button"
                      className="text-sm font-medium text-ink hover:text-brand text-left block truncate w-full"
                      onClick={() => handleEdit(reference)}
                      title="点击编辑"
                    >
                      {reference.title}
                    </button>
                    {/* 第三行：authors */}
                    <p className="text-xs text-muted mt-1 truncate">{authorsText}</p>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => handleDelete(reference)}
                      disabled={deletingId === reference.id}
                      title="删除"
                      aria-label="删除"
                    >
                      <AppIcon
                        icon={deletingId === reference.id ? ArrowPathIcon : TrashIcon}
                        size="sm"
                        className="text-danger"
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 表单弹框 */}
      <ReferenceFormModal
        projectId={projectId!}
        open={showFormModal}
        reference={editingReference}
        onClose={() => setShowFormModal(false)}
        onSaved={refresh}
      />

      {/* 资料选择器（从资料导入） */}
      <SourcePickerModal
        projectId={projectId!}
        open={showSourcePicker}
        onSelect={handleImportFromSource}
        onClose={() => setShowSourcePicker(false)}
        allowSkip={false}
      />
    </div>
  )
}
