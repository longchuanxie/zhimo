// AI 引导创建项目页
// 对应路由：/projects/new-guided
//
// 流程：
// 1. 用户用一句话描述项目
// 2. Agent 推断项目类型、名称、描述、建议字数
// 3. 分节点确认/完善：目标读者 → 写作目标 → 目标字数 → 风格规则 → 禁止规则
// 4. 最终确认并调用 createProject 创建项目

import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { OnboardingChat } from '@/components/project/OnboardingChat'
import { createProject } from '@/services/project/ProjectService'
import { useProjectOnboarding } from '@/hooks/useProjectOnboarding'

export function CreateProjectGuidedPage() {
  const navigate = useNavigate()
  const [
    { node, draft, messages, input, loading, error, submitting },
    { setInput, handleSend, handleBack, setError, setSubmitting, quickOptions },
  ] = useProjectOnboarding()

  const isFirstNode = node === 'description'
  const isConfirmNode = node === 'confirm'

  const goBack = () => {
    if (isFirstNode) {
      navigate('/projects')
      return
    }
    handleBack()
  }

  const handleConfirm = async () => {
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const result = await createProject({
      name: draft.name,
      type: draft.type,
      description: draft.description || undefined,
      writingGoal: draft.writingGoal || undefined,
      targetReader: draft.targetReader || undefined,
      targetWordCount: draft.targetWordCount || undefined,
      styleRules: draft.styleRules || undefined,
      forbiddenRules: draft.forbiddenRules || undefined,
    })

    setSubmitting(false)

    if (!result.ok) {
      setError({ message: result.error.message, code: result.error.code })
      return
    }

    navigate(`/projects/${result.data.id}`, { replace: true })
  }

  const onSend = async (overrideText?: string) => {
    if (isConfirmNode) {
      const confirmText = (overrideText ?? input).trim()
      if (confirmText !== '确认' && confirmText !== '创建') {
        setError({ message: '请输入「确认」或「创建」以完成项目创建' })
        return
      }
      await handleConfirm()
      return
    }
    await handleSend(overrideText)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-ghost" onClick={goBack}>
            <AppIcon icon={ArrowLeftIcon} size="sm" />
            {isFirstNode ? '返回项目列表' : '上一步'}
          </button>
          <h1 className="text-lg font-bold text-ink">AI 引导创建项目</h1>
        </div>
        {isConfirmNode && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting}
          >
            <AppIcon icon={CheckIcon} size="sm" />
            {submitting ? '创建中...' : '确认创建'}
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mt-4 rounded-md bg-danger-soft border border-danger/20 px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-danger">{error.message}</p>
          {error.code === 'MODEL_NOT_CONFIGURED' && (
            <button
              type="button"
              className="btn-ghost text-sm px-2 py-1 whitespace-nowrap"
              onClick={() => navigate('/settings/models')}
            >
              去配置模型
            </button>
          )}
        </div>
      )}

      {/* 对话区 */}
      <OnboardingChat
        messages={messages}
        input={input}
        onInputChange={setInput}
        onSend={onSend}
        loading={loading || submitting}
        quickOptions={quickOptions}
        onQuickOption={(option) => {
          onSend(option)
        }}
        placeholder={isConfirmNode ? '输入「确认」创建项目' : '输入你的回答...'}
      />
    </div>
  )
}
