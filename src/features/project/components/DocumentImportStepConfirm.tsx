// 从文档创建项目 - Step 3:确认创建表单
//
// 职责:
// - 表单展示项目元数据(可编辑,初始值来自 AI 推断或空表单)
// - 文档标题输入(默认 IMPORT_DEFAULT_DOCUMENT_TITLE)
// - 提交时回调主组件调 createProjectFromDocument
//
// 复用 FormField / TypeOption 共享组件,保持与 CreateProjectPage 一致的表单风格

import { useState } from 'react'
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { FormField } from './FormField'
import { TypeOption } from './TypeOption'
import { IMPORT_DEFAULT_DOCUMENT_TITLE } from '@/constants/projectImport'
import type { ProjectType } from '@/types'
import type { InferredProjectMeta } from '@/types/projectImport'

type FormState = {
  name: string
  type: ProjectType
  description: string
  writingGoal: string
  targetReader: string
  targetWordCount: string
  documentTitle: string
}

export type DocumentImportStepConfirmProps = {
  initialMeta: InferredProjectMeta | null
  submitting: boolean
  errorMsg: string | null
  onSubmit: (input: { meta: InferredProjectMeta; documentTitle: string }) => void
  onBack: () => void
}

const PROJECT_TYPES: ProjectType[] = ['research', 'fiction', 'free_writing']

export function DocumentImportStepConfirm({
  initialMeta,
  submitting,
  errorMsg,
  onSubmit,
  onBack,
}: DocumentImportStepConfirmProps) {
  const [form, setForm] = useState<FormState>({
    name: initialMeta?.name ?? '',
    type: initialMeta?.type ?? 'free_writing',
    description: initialMeta?.description ?? '',
    writingGoal: initialMeta?.writingGoal ?? '',
    targetReader: initialMeta?.targetReader ?? '',
    targetWordCount: initialMeta?.targetWordCount
      ? String(initialMeta.targetWordCount)
      : '',
    documentTitle: IMPORT_DEFAULT_DOCUMENT_TITLE,
  })

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const targetWordCountNum = form.targetWordCount
      ? parseInt(form.targetWordCount, 10)
      : 0

    if (form.targetWordCount && (isNaN(targetWordCountNum) || targetWordCountNum < 0)) {
      return
    }

    onSubmit({
      meta: {
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim(),
        writingGoal: form.writingGoal.trim(),
        targetReader: form.targetReader.trim(),
        targetWordCount: targetWordCountNum,
      },
      documentTitle: form.documentTitle.trim() || IMPORT_DEFAULT_DOCUMENT_TITLE,
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl mx-auto px-8 py-8 space-y-6"
      >
        <FormField label="项目名称" required>
          <input
            type="text"
            className="input"
            placeholder="给项目起个名字"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            maxLength={100}
            autoFocus
          />
        </FormField>

        <FormField label="项目类型" required>
          <div className="grid grid-cols-3 gap-3">
            {PROJECT_TYPES.map((type) => (
              <TypeOption
                key={type}
                type={type}
                selected={form.type === type}
                onClick={() => updateField('type', type)}
              />
            ))}
          </div>
        </FormField>

        <FormField label="文档标题" required>
          <input
            type="text"
            className="input"
            placeholder="新建正文的标题"
            value={form.documentTitle}
            onChange={(e) => updateField('documentTitle', e.target.value)}
            maxLength={100}
          />
        </FormField>

        <FormField label="项目描述">
          <textarea
            className="input min-h-[80px] resize-none"
            placeholder="简要描述这个项目要写什么"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            maxLength={500}
          />
        </FormField>

        <FormField label="写作目标">
          <textarea
            className="input min-h-[80px] resize-none"
            placeholder="这个项目希望达成什么目标?"
            value={form.writingGoal}
            onChange={(e) => updateField('writingGoal', e.target.value)}
            maxLength={500}
          />
        </FormField>

        <FormField label="目标读者">
          <input
            type="text"
            className="input"
            placeholder="例如:学术评审、大众读者"
            value={form.targetReader}
            onChange={(e) => updateField('targetReader', e.target.value)}
            maxLength={100}
          />
        </FormField>

        <FormField label="目标字数">
          <input
            type="number"
            className="input"
            placeholder="留空表示不设目标"
            value={form.targetWordCount}
            onChange={(e) => updateField('targetWordCount', e.target.value)}
            min={0}
          />
        </FormField>

        {errorMsg && (
          <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
            <p className="text-sm text-danger">{errorMsg}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-line">
          <button
            type="button"
            className="btn-secondary"
            onClick={onBack}
            disabled={submitting}
          >
            <AppIcon icon={ArrowLeftIcon} size="sm" />
            上一步
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !form.name.trim()}
          >
            <AppIcon icon={CheckIcon} size="sm" />
            {submitting ? '创建中...' : '创建项目'}
          </button>
        </div>
      </form>
    </div>
  )
}
