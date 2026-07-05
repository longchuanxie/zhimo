// 资料选择器弹框
// 对应任务：C.3 材料真实性保障
//
// 职责：
// - 共用资料选择器，供 ReferenceFormModal / FigureInsertModal 选择来源资料
// - 单选确认，可选"不关联来源"（由 allowSkip 控制）
// - 空状态引导用户先导入资料
//
// 架构约束：
// - 通过 SourceService.listSources 访问数据
// - 不直接访问数据库
// - 复用 Modal / EmptyState / LoadingState 基础组件

import { DocumentTextIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/foundation/Modal'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { listSources } from '@/services/source/SourceService'
import { SOURCE_TYPE_LABEL } from '@/constants/status'
import type { Source } from '@/types'

type Props = {
  /// 当前项目 ID
  projectId: string
  /// 是否打开
  open: boolean
  /// 选择回调，source 为 null 表示跳过关联
  onSelect: (source: Source | null) => void
  /// 关闭回调
  onClose: () => void
  /// 是否允许跳过（默认 true）
  allowSkip?: boolean
}

export function SourcePickerModal({
  projectId,
  open,
  onSelect,
  onClose,
  allowSkip = true,
}: Props) {
  const navigate = useNavigate()
  const { state } = useAsync<Source[]>(
    () => listSources(projectId),
    [projectId],
    { enabled: !!projectId && open },
  )

  const handleSelect = (source: Source) => {
    onSelect(source)
    onClose()
  }

  const handleSkip = () => {
    onSelect(null)
    onClose()
  }

  const handleGoToSources = () => {
    onClose()
    navigate(`/projects/${projectId}/sources`)
  }

  return (
    <Modal
      title="选择来源资料"
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          {allowSkip && (
            <button
              type="button"
              className="btn-ghost"
              onClick={handleSkip}
            >
              不关联来源
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
        </>
      }
    >
      {state.status === 'loading' && (
        <LoadingState message="正在加载资料列表..." />
      )}

      {state.status === 'error' && (
        <p className="text-sm text-danger py-4 text-center">
          资料加载失败：{state.error.message}
        </p>
      )}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          icon={DocumentTextIcon}
          title="还没有资料"
          description="请先在资料页导入资料，导入后可自动提取书目元数据用于参考文献生成。"
          primaryAction={{
            label: '去资料页导入',
            icon: ArrowLeftIcon,
            onClick: handleGoToSources,
          }}
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-auto">
          {state.data.map((source) => (
            <button
              key={source.id}
              type="button"
              className="w-full flex items-start gap-3 p-3 rounded-md border border-line hover:bg-surface-2 text-left transition-colors"
              onClick={() => handleSelect(source)}
            >
              <DocumentTextIcon className="w-5 h-5 text-muted mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">
                  {source.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-subtle">
                    {SOURCE_TYPE_LABEL[source.type] ?? source.type}
                  </span>
                  {source.bibliographicMetadata && (
                    <span className="text-xs text-success">
                      已提取书目元数据
                    </span>
                  )}
                  <span className="text-xs text-subtle">
                    {new Date(source.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                {source.summaryShort && (
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {source.summaryShort}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
