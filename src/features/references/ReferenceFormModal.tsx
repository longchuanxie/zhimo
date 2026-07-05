// 参考文献表单弹框（新建/编辑）
// 对应任务：C.5 参考文献管理
//
// 职责：
// - 新建或编辑参考文献条目
// - 字段：citationKey/entryType/title/authors/year/container/volume/issue/pages/publisher/city/doi/isbn/url/accessDate
// - 通过 SourcePickerModal 关联来源资料（材料真实性保障）
// - 前端校验 citationKey/title/authors 非空，其余由 ReferenceService 兜底
//
// 架构约束：
// - 通过 ReferenceService.createReference/updateReference 访问数据
// - 不直接访问数据库
// - 复用 Modal / SourcePickerModal 基础组件

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, LinkIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/foundation/Modal'
import { SourcePickerModal } from '@/components/source/SourcePickerModal'
import {
  createReference,
  updateReference,
} from '@/services/citation/ReferenceService'
import { REFERENCE_ENTRY_TYPE_LABEL } from '@/constants/status'
import { toast } from '@/stores/toastStore'
import type {
  Reference,
  ReferenceEntryType,
  AuthorInfo,
  Source,
} from '@/types'

type Props = {
  /// 当前项目 ID
  projectId: string
  /// 是否打开
  open: boolean
  /// 编辑的参考文献（null 表示新建）
  reference?: Reference | null
  /// 关闭回调
  onClose: () => void
  /// 保存成功回调
  onSaved: () => void
}

type FormState = {
  citationKey: string
  entryType: ReferenceEntryType
  title: string
  authors: AuthorInfo[]
  year: string
  container: string
  volume: string
  issue: string
  pages: string
  publisher: string
  city: string
  doi: string
  isbn: string
  url: string
  accessDate: string
  sourceId: string | null
  sourceTitle: string | null
}

const EMPTY_FORM: FormState = {
  citationKey: '',
  entryType: 'journal',
  title: '',
  authors: [{ name: '', affiliation: '' }],
  year: '',
  container: '',
  volume: '',
  issue: '',
  pages: '',
  publisher: '',
  city: '',
  doi: '',
  isbn: '',
  url: '',
  accessDate: '',
  sourceId: null,
  sourceTitle: null,
}

export function ReferenceFormModal({
  projectId,
  open,
  reference,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)

  // open 变化时根据 reference 初始化表单
  useEffect(() => {
    if (!open) return
    if (reference) {
      setForm({
        citationKey: reference.citationKey,
        entryType: reference.entryType,
        title: reference.title,
        authors:
          reference.authors.length > 0
            ? reference.authors.map((a) => ({ name: a.name, affiliation: a.affiliation ?? '' }))
            : [{ name: '', affiliation: '' }],
        year: reference.year ? String(reference.year) : '',
        container: reference.container ?? '',
        volume: reference.volume ?? '',
        issue: reference.issue ?? '',
        pages: reference.pages ?? '',
        publisher: reference.publisher ?? '',
        city: reference.city ?? '',
        doi: reference.doi ?? '',
        isbn: reference.isbn ?? '',
        url: reference.url ?? '',
        accessDate: reference.accessDate ?? '',
        sourceId: reference.sourceId,
        sourceTitle: null, // 编辑时不显示来源标题（需额外查询，简化处理）
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, reference])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const addAuthor = () => {
    setForm((prev) => ({
      ...prev,
      authors: [...prev.authors, { name: '', affiliation: '' }],
    }))
  }

  const removeAuthor = (index: number) => {
    setForm((prev) => ({
      ...prev,
      authors: prev.authors.filter((_, i) => i !== index),
    }))
  }

  const updateAuthor = (index: number, field: keyof AuthorInfo, value: string) => {
    setForm((prev) => ({
      ...prev,
      authors: prev.authors.map((a, i) =>
        i === index ? { ...a, [field]: value } : a,
      ),
    }))
  }

  const handleSelectSource = (source: Source | null) => {
    if (source) {
      updateField('sourceId', source.id)
      updateField('sourceTitle', source.title)
    } else {
      updateField('sourceId', null)
      updateField('sourceTitle', null)
    }
  }

  const validate = (): string | null => {
    if (!form.citationKey.trim()) return '引用标识不能为空'
    if (!form.title.trim()) return '参考文献标题不能为空'
    const validAuthors = form.authors.filter((a) => a.name.trim())
    if (validAuthors.length === 0) return '至少需要一位作者'
    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      const validAuthors = form.authors
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          ...(a.affiliation?.trim() ? { affiliation: a.affiliation.trim() } : {}),
        }))

      const commonInput = {
        citationKey: form.citationKey.trim(),
        entryType: form.entryType,
        title: form.title.trim(),
        authors: validAuthors,
        year: form.year ? Number(form.year) : null,
        container: form.container.trim() || null,
        volume: form.volume.trim() || null,
        issue: form.issue.trim() || null,
        pages: form.pages.trim() || null,
        publisher: form.publisher.trim() || null,
        city: form.city.trim() || null,
        doi: form.doi.trim() || null,
        isbn: form.isbn.trim() || null,
        url: form.url.trim() || null,
        accessDate: form.accessDate.trim() || null,
        sourceId: form.sourceId,
      }

      const result = reference
        ? await updateReference({
            referenceId: reference.id,
            patch: commonInput,
          })
        : await createReference({
            projectId,
            ...commonInput,
          })

      if (result.ok) {
        toast.success(reference ? '参考文献已更新' : '参考文献已创建')
        onSaved()
        onClose()
      } else {
        toast.error(`保存失败：${result.error.message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        title={reference ? '编辑参考文献' : '新建参考文献'}
        open={open}
        onClose={onClose}
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
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 关联来源（材料真实性） */}
          <div>
            <label className="text-xs text-muted block mb-1">关联来源资料</label>
            <button
              type="button"
              className="btn-secondary w-full flex items-center justify-center gap-2 px-3 py-2"
              onClick={() => setShowSourcePicker(true)}
              disabled={saving}
            >
              <LinkIcon className="w-4 h-4" />
              {form.sourceId
                ? `已关联：${form.sourceTitle ?? form.sourceId}`
                : '选择来源资料（可选）'}
            </button>
            {form.sourceId && (
              <button
                type="button"
                className="text-xs text-danger mt-1"
                onClick={() => handleSelectSource(null)}
              >
                移除关联
              </button>
            )}
          </div>

          {/* citationKey + entryType */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">
                引用标识 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                value={form.citationKey}
                onChange={(e) => updateField('citationKey', e.target.value)}
                placeholder="如：smith2020ai"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">文献类型</label>
              <select
                className="input w-full"
                value={form.entryType}
                onChange={(e) =>
                  updateField('entryType', e.target.value as ReferenceEntryType)
                }
                disabled={saving}
              >
                {(
                  Object.keys(REFERENCE_ENTRY_TYPE_LABEL) as ReferenceEntryType[]
                ).map((type) => (
                  <option key={type} value={type}>
                    {REFERENCE_ENTRY_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* title */}
          <div>
            <label className="text-xs text-muted block mb-1">
              标题 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="文献标题"
              disabled={saving}
            />
          </div>

          {/* authors */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted">
                作者 <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                className="text-xs text-brand flex items-center gap-1"
                onClick={addAuthor}
                disabled={saving}
              >
                <PlusIcon className="w-3 h-3" />
                添加作者
              </button>
            </div>
            <div className="space-y-2">
              {form.authors.map((author, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    value={author.name}
                    onChange={(e) => updateAuthor(index, 'name', e.target.value)}
                    placeholder="作者姓名"
                    disabled={saving}
                  />
                  <input
                    type="text"
                    className="input flex-1"
                    value={author.affiliation ?? ''}
                    onChange={(e) =>
                      updateAuthor(index, 'affiliation', e.target.value)
                    }
                    placeholder="机构（可选）"
                    disabled={saving}
                  />
                  {form.authors.length > 1 && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => removeAuthor(index)}
                      disabled={saving}
                      aria-label="移除作者"
                    >
                      <TrashIcon className="w-4 h-4 text-danger" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* year + container */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">年份</label>
              <input
                type="number"
                className="input w-full"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
                placeholder="2024"
                disabled={saving}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted block mb-1">
                期刊/书名/会议名
              </label>
              <input
                type="text"
                className="input w-full"
                value={form.container}
                onChange={(e) => updateField('container', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* volume + issue + pages */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">卷</label>
              <input
                type="text"
                className="input w-full"
                value={form.volume}
                onChange={(e) => updateField('volume', e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">期</label>
              <input
                type="text"
                className="input w-full"
                value={form.issue}
                onChange={(e) => updateField('issue', e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">页码</label>
              <input
                type="text"
                className="input w-full"
                value={form.pages}
                onChange={(e) => updateField('pages', e.target.value)}
                placeholder="如 1-20"
                disabled={saving}
              />
            </div>
          </div>

          {/* publisher + city */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">出版者</label>
              <input
                type="text"
                className="input w-full"
                value={form.publisher}
                onChange={(e) => updateField('publisher', e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">出版地</label>
              <input
                type="text"
                className="input w-full"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* doi + isbn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">DOI</label>
              <input
                type="text"
                className="input w-full"
                value={form.doi}
                onChange={(e) => updateField('doi', e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">ISBN</label>
              <input
                type="text"
                className="input w-full"
                value={form.isbn}
                onChange={(e) => updateField('isbn', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* url + accessDate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">URL</label>
              <input
                type="text"
                className="input w-full"
                value={form.url}
                onChange={(e) => updateField('url', e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">访问日期</label>
              <input
                type="date"
                className="input w-full"
                value={form.accessDate}
                onChange={(e) => updateField('accessDate', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </div>
      </Modal>

      <SourcePickerModal
        projectId={projectId}
        open={showSourcePicker}
        onSelect={handleSelectSource}
        onClose={() => setShowSourcePicker(false)}
        allowSkip
      />
    </>
  )
}
