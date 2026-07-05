// 项目设置页
// 对应路由：/projects/:projectId/settings
// 数据映射：ProjectService.getProject + ProjectService.updateProjectSettings + ProjectService.deleteProject

import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import {
  getProject,
  updateProjectSettings,
  deleteProject,
} from '@/services/project/ProjectService'
import { PROJECT_TYPE_LABEL, PROJECT_STATUS_LABEL } from '@/constants/status'
import { MemoryManagementSection } from '@/features/agent/MemoryManagementSection'
import { useDialog } from '@/hooks/useDialog'
import type { Project, ProjectStatus } from '@/types'

type FormState = {
  name: string
  description: string
  writingGoal: string
  targetReader: string
  targetWordCount: string
  styleRules: string
  forbiddenRules: string
  status: ProjectStatus
}

const STATUS_OPTIONS: ProjectStatus[] = [
  'draft',
  'writing',
  'revising',
  'ready_to_export',
  'completed',
  'archived',
]

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { confirm } = useDialog()

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await getProject(projectId!)
      if (cancelled) return

      if (result.ok) {
        setProject(result.data)
        setForm({
          name: result.data.name,
          description: result.data.description ?? '',
          writingGoal: result.data.writingGoal ?? '',
          targetReader: result.data.targetReader ?? '',
          targetWordCount:
            result.data.targetWordCount > 0
              ? String(result.data.targetWordCount)
              : '',
          styleRules: result.data.styleRules ?? '',
          forbiddenRules: result.data.forbiddenRules ?? '',
          status: result.data.status,
        })
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !form) return

    if (!form.name.trim()) {
      setSaveMsg('项目名称不能为空')
      return
    }

    const targetWordCountNum = form.targetWordCount
      ? parseInt(form.targetWordCount, 10)
      : 0

    if (form.targetWordCount && (isNaN(targetWordCountNum) || targetWordCountNum < 0)) {
      setSaveMsg('目标字数必须是非负整数')
      return
    }

    setSaving(true)
    setSaveMsg(null)

    const result = await updateProjectSettings({
      projectId,
      patch: {
        name: form.name.trim(),
        description: form.description.trim(),
        writingGoal: form.writingGoal.trim(),
        targetReader: form.targetReader.trim(),
        targetWordCount: targetWordCountNum,
        styleRules: form.styleRules.trim(),
        forbiddenRules: form.forbiddenRules.trim(),
        status: form.status,
      },
    })

    setSaving(false)

    if (result.ok) {
      setProject(result.data)
      setSaveMsg('已保存')
      setTimeout(() => setSaveMsg(null), 2000)
    } else {
      setSaveMsg(`保存失败：${result.error.message}`)
    }
  }

  const handleDelete = async () => {
    if (!projectId || !project) return

    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除项目「${project.name}」吗？项目数据将保留在本地数据库，但不会显示在列表中。`,
      danger: true,
    })
    if (!confirmed) return

    setDeleting(true)
    const result = await deleteProject(projectId)
    setDeleting(false)

    if (result.ok) {
      navigate('/projects', { replace: true })
    } else {
      setSaveMsg(`删除失败：${result.error.message}`)
    }
  }

  if (loading) {
    return <LoadingState message="正在加载项目设置..." />
  }

  if (error || !project || !form) {
    return (
      <ErrorState
        error={{
          code: 'NOT_FOUND',
          message: error ?? '项目不存在',
          retryable: false,
        }}
        title="项目设置加载失败"
      />
    )
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate(`/projects/${projectId}`)}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          返回项目首页
        </button>
        <h1 className="text-xl font-bold text-ink">项目设置</h1>
      </div>

      {/* 表单区 */}
      <div className="flex-1 overflow-auto">
        <form
          onSubmit={handleSave}
          className="max-w-2xl mx-auto px-8 py-8 space-y-6"
        >
          {/* 项目名称 */}
          <FormField label="项目名称" required>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              maxLength={100}
            />
          </FormField>

          {/* 项目类型（只读） */}
          <FormField label="项目类型" hint="项目类型创建后不可修改">
            <input
              type="text"
              className="input bg-surface-2"
              value={PROJECT_TYPE_LABEL[project.type]}
              disabled
            />
          </FormField>

          {/* 项目状态 */}
          <FormField label="项目状态">
            <select
              className="input"
              value={form.status}
              onChange={(e) => updateField('status', e.target.value as ProjectStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </FormField>

          {/* 项目描述 */}
          <FormField label="项目描述">
            <textarea
              className="input min-h-[80px] resize-none"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={500}
            />
          </FormField>

          {/* 写作目标 */}
          <FormField label="写作目标">
            <textarea
              className="input min-h-[80px] resize-none"
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
              value={form.styleRules}
              onChange={(e) => updateField('styleRules', e.target.value)}
              maxLength={1000}
            />
          </FormField>

          {/* 禁止规则 */}
          <FormField label="禁止规则" hint="AI 助手会避免触碰这些内容">
            <textarea
              className="input min-h-[80px] resize-none"
              value={form.forbiddenRules}
              onChange={(e) => updateField('forbiddenRules', e.target.value)}
              maxLength={1000}
            />
          </FormField>

          {/* Agent 记忆管理 */}
          <div className="pt-4 border-t border-line">
            <MemoryManagementSection projectId={projectId!} />
          </div>

          {/* 消息提示 */}
          {saveMsg && (
            <div
              className={`rounded-md border px-4 py-3 ${
                saveMsg.startsWith('保存失败') || saveMsg.startsWith('删除失败')
                  ? 'bg-danger-soft border-danger/20'
                  : 'bg-brand-soft border-brand/20'
              }`}
            >
              <p
                className={`text-sm ${
                  saveMsg.startsWith('保存失败') || saveMsg.startsWith('删除失败')
                    ? 'text-danger'
                    : 'text-brand'
                }`}
              >
                {saveMsg}
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-4 border-t border-line">
            <button
              type="button"
              className="btn-ghost text-danger hover:bg-danger-soft"
              onClick={handleDelete}
              disabled={deleting}
            >
              <AppIcon icon={TrashIcon} size="sm" />
              {deleting ? '删除中...' : '删除项目'}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/projects/${projectId}`)}
                disabled={saving}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !form.name.trim()}
              >
                <AppIcon icon={CheckIcon} size="sm" />
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============ 子组件：表单字段 ============

type FormFieldProps = {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}

function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  )
}
