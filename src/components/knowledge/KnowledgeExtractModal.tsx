// 知识提取预览弹窗
// 用于资料半自动提取场景：调用 extractFromSource 后展示草稿，
// 用户可编辑/勾选/排除，确认后批量保存为 pending 知识
//
// 数据映射：KnowledgeExtractor.extractFromSource + KnowledgeService.createKnowledge

import { useState } from 'react'
import { SparklesIcon, CheckIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import {
  extractFromSource,
  type KnowledgeDraft,
} from '@/services/knowledge/KnowledgeExtractor'
import { createKnowledge } from '@/services/knowledge/KnowledgeService'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_LABEL,
} from '@/constants/knowledgeTypes'
import { toast } from '@/stores/toastStore'

type DraftRow = KnowledgeDraft & {
  /// 是否勾选保存
  selected: boolean
}

type KnowledgeExtractModalProps = {
  projectId: string
  sourceId: string
  sourceTitle: string
  sourceContent: string
  onClose: () => void
  onSuccess: (savedCount: number) => void
}

export function KnowledgeExtractModal({
  projectId,
  sourceId,
  sourceTitle,
  sourceContent,
  onClose,
  onSuccess,
}: KnowledgeExtractModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [saving, setSaving] = useState(false)

  // 首次加载时触发提取
  if (loading && !error && rows.length === 0) {
    void (async () => {
      const result = await extractFromSource({
        projectId,
        sourceId,
        sourceTitle,
        sourceContent,
      })
      if (!result.ok) {
        setError(result.error.message)
        setLoading(false)
        return
      }
      setRows(
        result.data.map((d) => ({
          ...d,
          selected: true,
        })),
      )
      setLoading(false)
    })()
  }

  const handleToggle = (idx: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)),
    )
  }

  const handleFieldChange = (
    idx: number,
    field: keyof KnowledgeDraft,
    value: string | number,
  ) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r,
      ),
    )
  }

  const handleSave = async () => {
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) {
      toast.info('未勾选任何草稿')
      return
    }

    setSaving(true)
    let saved = 0
    for (const row of selected) {
      const result = await createKnowledge({
        projectId,
        title: row.title.trim(),
        type: row.type,
        content: row.content,
        summary: row.summary.trim() || undefined,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        confidence: row.confidence,
        aiUsageAllowed: true,
      })
      if (result.ok) saved++
    }
    setSaving(false)

    toast.success(`已保存 ${saved} 条知识草稿，请到知识库审阅确认`)
    onSuccess(saved)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="card w-full max-w-2xl p-8">
          <LoadingState message="正在从资料中提取知识..." />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="card w-full max-w-2xl p-6">
          <ErrorState
            error={{ code: 'UNKNOWN_ERROR', message: error, retryable: false }}
            title="知识提取失败"
            onRetry={onClose}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <AppIcon icon={SparklesIcon} size="sm" />
            <h2 className="text-lg font-bold text-ink">
              提取知识：{sourceTitle}
            </h2>
          </div>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 草稿列表 */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted">
              未从该资料中提取到可用知识
            </div>
          ) : (
            rows.map((row, idx) => (
              <DraftRowItem
                key={idx}
                row={row}
                onToggle={() => handleToggle(idx)}
                onFieldChange={(field, value) =>
                  handleFieldChange(idx, field, value)
                }
              />
            ))
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-line">
          <span className="text-sm text-subtle">
            共 {rows.length} 条草稿，已勾选{' '}
            {rows.filter((r) => r.selected).length} 条
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={
                saving || rows.filter((r) => r.selected).length === 0
              }
            >
              <AppIcon icon={CheckIcon} size="sm" />
              {saving ? '保存中...' : '保存选中草稿'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ 子组件：单条草稿 ============

type DraftRowItemProps = {
  row: DraftRow
  onToggle: () => void
  onFieldChange: (
    field: keyof KnowledgeDraft,
    value: string | number,
  ) => void
}

function DraftRowItem({
  row,
  onToggle,
  onFieldChange,
}: DraftRowItemProps) {
  return (
    <div
      className={`rounded-md border p-4 transition-colors ${
        row.selected
          ? 'border-brand/40 bg-brand-soft/30'
          : 'border-line bg-surface'
      }`}
    >
      {/* 勾选 + 标题 */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.selected}
          onChange={onToggle}
          className="mt-1.5 rounded border-line"
        />
        <div className="flex-1 space-y-2">
          <input
            type="text"
            className="input text-sm font-semibold"
            value={row.title}
            onChange={(e) => onFieldChange('title', e.target.value)}
            disabled={!row.selected}
          />
          <div className="flex items-center gap-2">
            <select
              className="input flex-1 py-1 text-sm"
              value={row.type}
              onChange={(e) => onFieldChange('type', e.target.value)}
              disabled={!row.selected}
            >
              {KNOWLEDGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KNOWLEDGE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="input w-24 py-1 text-sm"
              min={0}
              max={1}
              step={0.1}
              value={row.confidence}
              onChange={(e) =>
                onFieldChange('confidence', Number(e.target.value))
              }
              disabled={!row.selected}
            />
            <span className="text-xs text-subtle">置信度</span>
          </div>
          <input
            type="text"
            className="input py-1 text-sm"
            placeholder="摘要"
            value={row.summary}
            onChange={(e) => onFieldChange('summary', e.target.value)}
            disabled={!row.selected}
          />
          <textarea
            className="input min-h-[80px] py-1.5 text-sm"
            value={row.content}
            onChange={(e) => onFieldChange('content', e.target.value)}
            disabled={!row.selected}
          />
        </div>
      </div>
    </div>
  )
}
