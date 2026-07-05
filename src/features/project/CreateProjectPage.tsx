// 创建项目页
// 对应路由：/projects/new
// 对应文档：02_UX_UI_原型与规范/prototypes/高保真客户端原型_v0.2_数据API对齐.html
// 数据映射：ProjectService.createProject

import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { createProject } from '@/services/project/ProjectService'
import type { ProjectType } from '@/types'
import { FormField } from './components/FormField'
import { TypeOption } from './components/TypeOption'

type FormState = {
  name: string
  type: ProjectType
  description: string
  writingGoal: string
  targetReader: string
  targetWordCount: string
  styleRules: string
  forbiddenRules: string
}

const INITIAL_FORM: FormState = {
  name: '',
  type: 'free_writing',
  description: '',
  writingGoal: '',
  targetReader: '',
  targetWordCount: '',
  styleRules: '',
  forbiddenRules: '',
}

const PROJECT_TYPES: ProjectType[] = ['research', 'fiction', 'free_writing']

export function CreateProjectPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      setErrorMsg('请填写项目名称')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    const targetWordCountNum = form.targetWordCount
      ? parseInt(form.targetWordCount, 10)
      : 0

    if (form.targetWordCount && (isNaN(targetWordCountNum) || targetWordCountNum < 0)) {
      setErrorMsg('目标字数必须是非负整数')
      setSubmitting(false)
      return
    }

    const result = await createProject({
      name: form.name,
      type: form.type,
      description: form.description.trim() || undefined,
      writingGoal: form.writingGoal.trim() || undefined,
      targetReader: form.targetReader.trim() || undefined,
      targetWordCount: targetWordCountNum || undefined,
      styleRules: form.styleRules.trim() || undefined,
      forbiddenRules: form.forbiddenRules.trim() || undefined,
    })

    setSubmitting(false)

    if (!result.ok) {
      setErrorMsg(result.error.message)
      return
    }

    // 创建成功，跳转到项目首页
    navigate(`/projects/${result.data.id}`, { replace: true })
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate('/projects')}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          返回项目列表
        </button>
        <h1 className="text-xl font-bold text-ink">创建新项目</h1>
      </div>

      {/* 表单区 */}
      <div className="flex-1 overflow-auto">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto px-8 py-8 space-y-6"
        >
          {/* 项目名称 */}
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

          {/* 项目类型 */}
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

          {/* 项目描述 */}
          <FormField label="项目描述">
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="简要描述这个项目要写什么"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={500}
            />
          </FormField>

          {/* 写作目标 */}
          <FormField label="写作目标">
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="这个项目希望达成什么目标？例如：完成一篇 3 万字的研究报告"
              value={form.writingGoal}
              onChange={(e) => updateField('writingGoal', e.target.value)}
              maxLength={500}
            />
          </FormField>

          {/* 目标读者 */}
          <FormField label="目标读者">
            <input
              type="text"
              className="input"
              placeholder="例如：学术评审、大众读者、特定行业从业者"
              value={form.targetReader}
              onChange={(e) => updateField('targetReader', e.target.value)}
              maxLength={100}
            />
          </FormField>

          {/* 目标字数 */}
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

          {/* 写作风格规则 */}
          <FormField label="写作风格规则" hint="AI 助手会遵循这些规则">
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="例如：使用正式学术语言、避免口语化表达、每段不超过 200 字"
              value={form.styleRules}
              onChange={(e) => updateField('styleRules', e.target.value)}
              maxLength={1000}
            />
          </FormField>

          {/* 禁止规则 */}
          <FormField label="禁止规则" hint="AI 助手会避免触碰这些内容">
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="例如：不使用第一人称、不出现具体人名、不引用未标注来源的数据"
              value={form.forbiddenRules}
              onChange={(e) => updateField('forbiddenRules', e.target.value)}
              maxLength={1000}
            />
          </FormField>

          {/* 错误提示 */}
          {errorMsg && (
            <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
              <p className="text-sm text-danger">{errorMsg}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/projects')}
              disabled={submitting}
            >
              取消
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
    </div>
  )
}
