// 从文档创建项目页
// 对应路由:/projects/new-from-document
//
// 三步流程(对齐 IMPORT_STEPS):
// 1. 选择文档 → pickAndParseDocument
// 2. AI 推断元数据 → inferProjectFromDocument
// 3. 确认创建表单 → createProjectFromDocument
//
// 架构约束:
// - 不直接访问文件系统/模型/DB,全部走 Service
// - 错误码用 Service 返回的 message,不在组件硬编码
// - 单组件保持简洁,三步拆为子组件

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { createProjectFromDocument } from '@/services/document/DocumentImportService'
import { UI_TEXT } from '@/constants/objectLabels'
import type { StructuredDoc, InferredProjectMeta } from '@/types/projectImport'
import { DocumentImportStepSelect } from './components/DocumentImportStepSelect'
import { DocumentImportStepInfer } from './components/DocumentImportStepInfer'
import { DocumentImportStepConfirm } from './components/DocumentImportStepConfirm'

type Step = 'select' | 'infer' | 'confirm'

const STEP_TITLES: Record<Step, string> = {
  select: '1. 选择文档',
  infer: '2. AI 推断元数据',
  confirm: '3. 确认创建',
}

export function CreateProjectFromDocumentPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('select')
  const [structuredDoc, setStructuredDoc] = useState<StructuredDoc | null>(null)
  const [inferredMeta, setInferredMeta] = useState<InferredProjectMeta | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleBack = () => {
    setErrorMsg(null)
    if (step === 'select') {
      navigate('/projects')
      return
    }
    if (step === 'infer') {
      setStep('select')
      return
    }
    // confirm → infer(允许重试推断或直接手动填写)
    setStep('infer')
  }

  const handlePicked = (doc: StructuredDoc) => {
    setStructuredDoc(doc)
    setErrorMsg(null)
  }

  const handleInferred = (meta: InferredProjectMeta) => {
    setInferredMeta(meta)
  }

  // 从 infer 步进入 confirm 步:无论推断成功还是手动填写,都把当前 meta(可能为 null)带入
  const handleGotoConfirm = () => {
    setStep('confirm')
  }

  const handleSubmit = async (input: {
    meta: InferredProjectMeta
    documentTitle: string
  }) => {
    if (!structuredDoc) return
    setSubmitting(true)
    setErrorMsg(null)
    const result = await createProjectFromDocument({
      // documentPath 仅用于调试/日志,不参与创建逻辑(见 CreateProjectFromDocumentInput 注释)
      documentPath: '',
      structuredDoc,
      meta: input.meta,
      documentTitle: input.documentTitle,
    })
    setSubmitting(false)
    if (!result.ok) {
      setErrorMsg(result.error.message)
      return
    }
    navigate(`/projects/${result.data.projectId}`, { replace: true })
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-line">
        <button type="button" className="btn-ghost" onClick={handleBack}>
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          {step === 'select' ? '返回项目列表' : '上一步'}
        </button>
        <h1 className="text-xl font-bold text-ink">
          {UI_TEXT.createProjectFromDocument}
        </h1>
        <span className="ml-auto text-sm text-subtle">{STEP_TITLES[step]}</span>
      </div>

      {/* 步骤内容 */}
      {step === 'select' && (
        <div className="flex-1 overflow-auto">
          <DocumentImportStepSelect
            structuredDoc={structuredDoc}
            onPicked={handlePicked}
            onNext={() => setStep('infer')}
          />
        </div>
      )}

      {step === 'infer' && structuredDoc && (
        <div className="flex-1 overflow-auto">
          <DocumentImportStepInfer
            plainText={structuredDoc.plainText}
            onInferred={handleInferred}
            onManualFill={handleGotoConfirm}
          />
        </div>
      )}

      {step === 'confirm' && (
        <DocumentImportStepConfirm
          initialMeta={inferredMeta}
          submitting={submitting}
          errorMsg={errorMsg}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
