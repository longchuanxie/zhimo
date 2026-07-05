// 从文档创建项目 - Step 2:AI 推断元数据
//
// 职责:
// - 进入时自动调 inferProjectFromDocument
// - 加载态/成功态/失败态全覆盖
// - 失败时提供「手动填写」兜底;MODEL_NOT_CONFIGURED 额外提供「去配置模型」
//
// 不直接调用模型 API,全部走 ProjectInferenceService

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { inferProjectFromDocument } from '@/services/project/ProjectInferenceService'
import { PROJECT_TYPE_LABEL } from '@/constants/status'
import { MODEL_NOT_CONFIGURED } from '@/constants/errors'
import type { InferredProjectMeta } from '@/types/projectImport'

export type DocumentImportStepInferProps = {
  plainText: string
  onInferred: (meta: InferredProjectMeta) => void
  onManualFill: () => void
}

export function DocumentImportStepInfer({
  plainText,
  onInferred,
  onManualFill,
}: DocumentImportStepInferProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [meta, setMeta] = useState<InferredProjectMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setErrorMsg(null)
      setErrorCode(null)
      const result = await inferProjectFromDocument(plainText)
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setErrorCode(result.error.code)
        setErrorMsg(result.error.message)
        return
      }
      setMeta(result.data)
      onInferred(result.data)
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plainText])

  // 加载态
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent" />
        <p className="mt-4 text-sm text-muted">AI 正在分析文档...</p>
      </div>
    )
  }

  // 失败态
  if (errorMsg) {
    const isModelNotConfigured = errorCode === MODEL_NOT_CONFIGURED
    return (
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
          <p className="text-sm text-danger">{errorMsg}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={onManualFill}
          >
            手动填写项目信息
          </button>
          {isModelNotConfigured && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate('/settings/models')}
            >
              <AppIcon icon={Cog6ToothIcon} size="sm" />
              去配置模型
            </button>
          )}
        </div>
      </div>
    )
  }

  // 成功态:展示推断结果摘要
  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <div className="rounded-md border border-line bg-surface px-4 py-4 space-y-2">
        <p className="text-sm font-semibold text-ink">{meta?.name}</p>
        <p className="text-xs text-subtle">
          类型:{PROJECT_TYPE_LABEL[meta?.type ?? 'free_writing']}
        </p>
        {meta?.description && (
          <p className="text-sm text-muted line-clamp-3">{meta.description}</p>
        )}
        <p className="text-xs text-subtle">
          目标字数:{meta?.targetWordCount ?? '未设定'}
        </p>
      </div>

      <div className="flex items-center justify-end pt-4 border-t border-line">
        <button type="button" className="btn-primary" onClick={onManualFill}>
          <AppIcon icon={ArrowRightIcon} size="sm" />
          下一步:确认创建
        </button>
      </div>
    </div>
  )
}
