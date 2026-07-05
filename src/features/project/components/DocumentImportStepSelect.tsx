// 从文档创建项目 - Step 1:选择文档
//
// 职责:
// - 触发 pickAndParseDocument 弹文件选择对话框
// - 展示已选文档信息卡(格式/字数/节点数)
// - 用户取消选择静默忽略,其他错误显示
//
// 不直接访问文件系统/不直接 invoke Rust,全部走 DocumentImportService

import { useState } from 'react'
import {
  ArrowRightIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { pickAndParseDocument } from '@/services/document/DocumentImportService'
import { IMPORT_FORMAT_LABEL } from '@/constants/projectImport'
import { OPERATION_CANCELLED } from '@/constants/errors'
import type { StructuredDoc } from '@/types/projectImport'

export type DocumentImportStepSelectProps = {
  structuredDoc: StructuredDoc | null
  onPicked: (doc: StructuredDoc) => void
  onNext: () => void
}

export function DocumentImportStepSelect({
  structuredDoc,
  onPicked,
  onNext,
}: DocumentImportStepSelectProps) {
  const [picking, setPicking] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handlePick = async () => {
    setPicking(true)
    setErrorMsg(null)
    const result = await pickAndParseDocument()
    setPicking(false)
    if (!result.ok) {
      // 用户取消选择静默忽略,不报错
      if (result.error.code !== OPERATION_CANCELLED) {
        setErrorMsg(result.error.message)
      }
      return
    }
    onPicked(result.data)
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      {/* 选择文档按钮 */}
      <div className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center">
        <AppIcon icon={ArrowUpTrayIcon} size="lg" />
        <p className="mt-3 text-sm text-muted">
          支持 Markdown / 纯文本 / Word / PDF 文档
        </p>
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={handlePick}
          disabled={picking}
        >
          <AppIcon icon={ArrowUpTrayIcon} size="sm" />
          {picking ? '选择中...' : '选择文档'}
        </button>
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
          <p className="text-sm text-danger">{errorMsg}</p>
        </div>
      )}

      {/* 文档信息卡 */}
      {structuredDoc && (
        <div className="rounded-md border border-line bg-surface px-4 py-4 flex items-start gap-3">
          <AppIcon icon={DocumentTextIcon} size="md" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-ink">
              {IMPORT_FORMAT_LABEL[structuredDoc.format] ?? structuredDoc.format}
            </p>
            <p className="text-xs text-subtle">
              {structuredDoc.wordCount} 字 · {structuredDoc.nodes.length} 个段落
            </p>
          </div>
        </div>
      )}

      {/* 下一步 */}
      <div className="flex items-center justify-end pt-4 border-t border-line">
        <button
          type="button"
          className="btn-primary"
          onClick={onNext}
          disabled={!structuredDoc}
        >
          <AppIcon icon={ArrowRightIcon} size="sm" />
          下一步:AI 推断元数据
        </button>
      </div>
    </div>
  )
}
