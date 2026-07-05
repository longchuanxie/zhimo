// 引文插入弹框
// 对应任务：C.6 引文插入
//
// 职责：
// - 加载项目参考文献库
// - 选择一个 Reference + 填写 locator/prefix/suffix + citationFormat
// - 调用 CitationService.createCitation 生成引文记录
// - 调用 CitationMark.setCitation 命令在选区插入引文 mark
//
// 材料真实性：引文必须关联项目参考文献库中的条目，禁止引用不存在的文献
//
// 依赖：CitationMark.setCitation 命令、CitationService.createCitation、ReferenceService.listReferences

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpenIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/foundation/Modal'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { listReferences } from '@/services/citation/ReferenceService'
import { createCitation } from '@/services/citation/CitationService'
import { CITATION_FORMAT_LABEL } from '@/constants/status'
import { toast } from '@/stores/toastStore'
import type { Editor } from '@tiptap/react'
import type { Reference, CitationFormat } from '@/types'

type Props = {
  editor: Editor | null
  documentId: string
  projectId: string
  open: boolean
  onClose: () => void
}

export function CitationInsertModal({
  editor,
  documentId,
  projectId,
  open,
  onClose,
}: Props) {
  const navigate = useNavigate()
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null)
  const [locator, setLocator] = useState('')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [citationFormat, setCitationFormat] = useState<CitationFormat>('numeric')
  const [submitting, setSubmitting] = useState(false)

  const { state } = useAsync<Reference[]>(
    () => listReferences(projectId),
    [projectId],
    { enabled: !!projectId && open },
  )

  const handleSelect = (ref: Reference) => {
    setSelectedRefId(ref.id)
  }

  const handleSubmit = async () => {
    if (!editor || !selectedRefId) return
    setSubmitting(true)
    try {
      const result = await createCitation({
        projectId,
        documentId,
        referenceId: selectedRefId,
        citationFormat,
        locator: locator.trim() || null,
        prefix: prefix.trim() || null,
        suffix: suffix.trim() || null,
      })

      if (result.ok) {
        editor
          .chain()
          .focus()
          .setCitation({
            citationId: result.data.id,
            referenceId: selectedRefId,
          })
          .run()
        toast.success('引文已插入')
        onClose()
        // 重置表单
        setSelectedRefId(null)
        setLocator('')
        setPrefix('')
        setSuffix('')
      } else {
        toast.error(`插入失败：${result.error.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoToReferences = () => {
    onClose()
    navigate(`/projects/${projectId}/references`)
  }

  const selectedReference = state.status === 'success'
    ? state.data.find((r) => r.id === selectedRefId)
    : null

  return (
    <Modal
      title="插入引文"
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!selectedRefId || submitting}
          >
            {submitting ? '插入中...' : '插入引文'}
          </button>
        </>
      }
    >
      {state.status === 'loading' && (
        <LoadingState message="正在加载参考文献库..." />
      )}

      {state.status === 'error' && (
        <p className="text-sm text-danger py-4 text-center">
          参考文献库加载失败：{state.error.message}
        </p>
      )}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          icon={BookOpenIcon}
          title="还没有参考文献"
          description="引文必须关联参考文献库中的条目，请先新建或从资料导入参考文献。"
          primaryAction={{
            label: '去参考文献页',
            icon: ArrowRightIcon,
            onClick: handleGoToReferences,
          }}
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <div className="space-y-4">
          {/* 参考文献列表（单选） */}
          <div>
            <label className="text-xs text-muted block mb-2">
              选择参考文献 <span className="text-danger">*</span>
            </label>
            <div className="max-h-60 overflow-auto border border-line rounded-md divide-y divide-line">
              {state.data.map((ref) => (
                <button
                  key={ref.id}
                  type="button"
                  className={`w-full flex items-start gap-2 p-3 text-left transition-colors ${
                    selectedRefId === ref.id
                      ? 'bg-brand-soft/50'
                      : 'hover:bg-surface-2'
                  }`}
                  onClick={() => handleSelect(ref)}
                >
                  <input
                    type="radio"
                    checked={selectedRefId === ref.id}
                    onChange={() => handleSelect(ref)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="text-xs font-mono text-brand">
                        {ref.citationKey}
                      </code>
                      {ref.year && (
                        <span className="text-xs text-subtle">{ref.year}</span>
                      )}
                    </div>
                    <div className="text-sm text-ink truncate">{ref.title}</div>
                    <div className="text-xs text-muted truncate">
                      {ref.authors.map((a) => a.name).join(', ')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 引文选项 */}
          {selectedReference && (
            <div className="p-3 bg-surface-2/50 rounded-md space-y-3">
              <div className="text-xs text-muted">引文选项</div>

              {/* citationFormat */}
              <div>
                <label className="text-xs text-muted block mb-1">引文格式</label>
                <select
                  className="input w-full"
                  value={citationFormat}
                  onChange={(e) =>
                    setCitationFormat(e.target.value as CitationFormat)
                  }
                >
                  {(Object.keys(CITATION_FORMAT_LABEL) as CitationFormat[]).map(
                    (format) => (
                      <option key={format} value={format}>
                        {CITATION_FORMAT_LABEL[format]}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">前缀</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="如 见"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">页码</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value)}
                    placeholder="如 p.123"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">后缀</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="如 第2版"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
