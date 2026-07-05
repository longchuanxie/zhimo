// 交叉引用插入弹框
// 对应任务：C.9 交叉引用插入
//
// 职责：
// - 加载文档内已插入的图表（figure/table）和公式（equation）
// - 选择目标（targetType + targetId + label）
// - 调用 CrossReference.setCrossReference 命令在选区插入交叉引用 mark
//
// 依赖：CrossReference.setCrossReference 命令、FigureService.listFiguresByDocumentId、EquationService.listEquationsByDocumentId

import { Modal } from '@/components/foundation/Modal'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { listFiguresByDocumentId } from '@/services/figure/FigureService'
import { listEquationsByDocumentId } from '@/services/equation/EquationService'
import { FIGURE_KIND_LABEL } from '@/constants/status'
import { toast } from '@/stores/toastStore'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import type { Editor } from '@tiptap/react'
import type { Figure, Equation } from '@/types'

type Props = {
  editor: Editor | null
  documentId: string
  projectId: string
  open: boolean
  onClose: () => void
}

type TargetItem = {
  id: string
  type: 'figure' | 'equation'
  typeLabel: string
  number: number | null
  label: string | null
  preview: string
}

export function CrossReferenceInsertModal({
  editor,
  documentId,
  projectId: _projectId,
  open,
  onClose,
}: Props) {
  // 并行加载图表和公式
  const figuresState = useAsync<Figure[]>(
    () => listFiguresByDocumentId(documentId),
    [documentId],
    { enabled: !!documentId && open },
  )
  const equationsState = useAsync<Equation[]>(
    () => listEquationsByDocumentId(documentId),
    [documentId],
    { enabled: !!documentId && open },
  )

  const isLoading =
    figuresState.state.status === 'loading' ||
    equationsState.state.status === 'loading'

  const items: TargetItem[] = []
  if (figuresState.state.status === 'success') {
    for (const fig of figuresState.state.data) {
      items.push({
        id: fig.id,
        type: 'figure',
        typeLabel: FIGURE_KIND_LABEL[fig.kind],
        number: fig.number,
        label: fig.label,
        preview: fig.caption,
      })
    }
  }
  if (equationsState.state.status === 'success') {
    for (const eq of equationsState.state.data) {
      items.push({
        id: eq.id,
        type: 'equation',
        typeLabel: '公式',
        number: eq.number,
        label: eq.label,
        preview: eq.latex.length > 40 ? eq.latex.substring(0, 40) + '...' : eq.latex,
      })
    }
  }

  const handleSelect = (item: TargetItem) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .setCrossReference({
        targetId: item.id,
        targetType: item.type,
        label: item.label,
      })
      .run()
    toast.success('交叉引用已插入')
    onClose()
  }

  return (
    <Modal
      title="插入交叉引用"
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          取消
        </button>
      }
    >
      {isLoading && <LoadingState message="正在加载图表和公式..." />}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={ChartBarIcon}
          title="没有可引用的对象"
          description="请先在文档中插入图表或公式，然后才能创建交叉引用。"
        />
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-auto">
          {items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className="w-full flex items-start gap-3 p-3 rounded-md border border-line hover:bg-surface-2 text-left transition-colors"
              onClick={() => handleSelect(item)}
            >
              <div className="flex-shrink-0 w-16">
                <span className="text-xs text-brand bg-brand-soft/40 px-1.5 py-0.5 rounded">
                  {item.typeLabel}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {item.number && (
                    <span className="text-sm font-medium text-ink">
                      {item.typeLabel} {item.number}
                    </span>
                  )}
                  {item.label && (
                    <code className="text-xs font-mono text-muted">
                      {item.label}
                    </code>
                  )}
                </div>
                <p className="text-xs text-muted truncate">{item.preview}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
