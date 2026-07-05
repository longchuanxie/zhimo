// 创建知识新版本弹窗
// 用于 KnowledgeDetailPage 的「创建新版本」按钮
// 预填旧知识字段，用户编辑后调用 replaceKnowledge
// 成功后触发 onReplaced(newId)，由父组件跳转到新版本详情页
//
// 数据映射：KnowledgeService.replaceKnowledge

import { useState, useEffect } from 'react'
import { ArrowUturnUpIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/foundation/Modal'
import { AppIcon } from '@/components/foundation/AppIcon'
import { replaceKnowledge } from '@/services/knowledge/KnowledgeService'
import { toast } from '@/stores/toastStore'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_LABEL,
  type KnowledgeType,
} from '@/constants/knowledgeTypes'
import type { Knowledge } from '@/types'

type ReplaceKnowledgeModalProps = {
  /// 旧知识（被替换的版本）
  oldKnowledge: Knowledge
  /// 是否打开
  open: boolean
  /// 关闭回调
  onClose: () => void
  /// 创建成功回调（参数为新知识 ID，用于跳转）
  onReplaced: (newId: string) => void
}

export function ReplaceKnowledgeModal({
  oldKnowledge,
  open,
  onClose,
  onReplaced,
}: ReplaceKnowledgeModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeType>('character')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [confidence, setConfidence] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  // 打开时预填旧知识字段
  useEffect(() => {
    if (open) {
      setTitle(oldKnowledge.title)
      setType(oldKnowledge.type as KnowledgeType)
      setContent(oldKnowledge.content)
      setSummary(oldKnowledge.summary ?? '')
      setConfidence(oldKnowledge.confidence ?? '')
    }
  }, [open, oldKnowledge])

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('标题和内容不能为空')
      return
    }

    setSaving(true)
    const result = await replaceKnowledge({
      oldKnowledgeId: oldKnowledge.id,
      title: title.trim(),
      type,
      content,
      summary: summary.trim() || undefined,
      confidence: confidence === '' ? null : Number(confidence),
    })
    setSaving(false)

    if (result.ok) {
      toast.success(`已创建新版本 v${result.data.version}，旧版本已标记为废弃`)
      onReplaced(result.data.id)
    } else {
      toast.error(`创建新版本失败：${result.error.message}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`创建新版本（当前 v${oldKnowledge.version} → 新建 v${oldKnowledge.version + 1}）`}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
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
            <AppIcon icon={ArrowUturnUpIcon} size="sm" />
            {saving ? '创建中...' : '创建新版本'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">标题</label>
          <input
            type="text"
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1">类型</label>
          <select
            className="input w-full"
            value={type}
            onChange={(e) => setType(e.target.value as KnowledgeType)}
            disabled={saving}
          >
            {KNOWLEDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {KNOWLEDGE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1">内容</label>
          <textarea
            className="input w-full min-h-[200px] font-mono text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1">
            摘要（可选）
          </label>
          <input
            type="text"
            className="input w-full"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={saving}
            maxLength={500}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1">
            置信度（0-1，可选）
          </label>
          <input
            type="number"
            className="input w-full"
            value={confidence}
            onChange={(e) =>
              setConfidence(e.target.value === '' ? '' : Number(e.target.value))
            }
            disabled={saving}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        <p className="text-xs text-muted">
          创建新版本后，旧版本（v{oldKnowledge.version}）将自动标记为「已废弃」，但不会被删除，可在版本链路中查看。
        </p>
      </div>
    </Modal>
  )
}
