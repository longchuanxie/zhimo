// 拼写检查面板
//
// 职责：
// - 调用 SpellCheckService.checkSpelling 加载文档拼写检查结果
// - 展示问题列表：按错误类型着色（错别字红色 / 语法琥珀色 / 用词蓝色）
// - 提供"重新检查"按钮
// - 可折叠，默认展开
//
// 依赖：SpellCheckService.checkSpelling

import { useState } from 'react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { LoadingState } from '@/components/foundation/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { checkSpelling } from '@/services/spellcheck/SpellCheckService'
import type { SpellCheckIssue, SpellCheckIssueKind } from '@/types'

type Props = {
  documentId: string
  className?: string
}

/// 错误类型中文标签
const ISSUE_KIND_LABEL: Record<SpellCheckIssueKind, string> = {
  typo: '错别字',
  grammar: '语法',
  usage: '用词',
}

/// 错误类型样式映射
type IssueStyle = {
  /// 容器类名
  container: string
  /// 图标类名
  icon: string
  /// 文本类名
  text: string
  /// 图标组件
  Icon: typeof XCircleIcon
}

const ISSUE_KIND_STYLE: Record<SpellCheckIssueKind, IssueStyle> = {
  typo: {
    container: 'bg-red-50 border-red-200',
    icon: 'text-red-600',
    text: 'text-red-700',
    Icon: XCircleIcon,
  },
  grammar: {
    container: 'bg-amber-50 border-amber-200',
    icon: 'text-amber-600',
    text: 'text-amber-700',
    Icon: ExclamationTriangleIcon,
  },
  usage: {
    container: 'bg-blue-50 border-blue-200',
    icon: 'text-blue-600',
    text: 'text-blue-700',
    Icon: InformationCircleIcon,
  },
}

export function SpellCheckPanel({ documentId, className }: Props) {
  const { state, refresh } = useAsync(
    () => checkSpelling(documentId),
    [documentId],
  )
  const [expanded, setExpanded] = useState(true)

  const issues: SpellCheckIssue[] =
    state.status === 'success' ? state.data : []

  // 折叠时的摘要
  const summary = (() => {
    if (state.status !== 'success') return null
    if (issues.length === 0) return '检查通过'
    return `${issues.length} 项问题`
  })()

  return (
    <div
      className={`border-t border-line bg-surface/80 ${className ?? ''}`}
    >
      {/* 头部：标题 + 折叠按钮 + 重新检查 */}
      <div className="flex items-center gap-2 px-6 py-2">
        <button
          type="button"
          className="flex items-center gap-2 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="text-sm font-medium text-ink">拼写检查</span>
          {state.status === 'success' && issues.length === 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              通过
            </span>
          )}
          {state.status === 'success' && issues.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              {summary}
            </span>
          )}
          <span className="ml-auto">
            {expanded ? (
              <ChevronDownIcon className="w-4 h-4 text-muted" />
            ) : (
              <ChevronUpIcon className="w-4 h-4 text-muted" />
            )}
          </span>
        </button>
        <button
          type="button"
          className="btn-ghost text-xs flex items-center gap-1"
          onClick={refresh}
          disabled={state.status === 'loading'}
          title="重新检查"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
          重新检查
        </button>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-6 pb-3 space-y-3">
          {state.status === 'loading' && (
            <LoadingState message="正在检查拼写与用词..." />
          )}

          {state.status === 'error' && (
            <p className="text-sm text-danger">
              拼写检查失败：{state.error.message}
            </p>
          )}

          {state.status === 'success' && (
            <>
              {/* 问题列表 */}
              {issues.length > 0 && (
                <div className="space-y-1.5">
                  {issues.map((issue, idx) => {
                    const style = ISSUE_KIND_STYLE[issue.kind]
                    const { Icon } = style
                    return (
                      <div
                        key={`${issue.kind}-${idx}`}
                        className={`flex items-start gap-2 p-2 rounded-md text-xs ${style.container} border`}
                      >
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${style.icon}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={`text-xs font-medium ${style.text}`}
                            >
                              {ISSUE_KIND_LABEL[issue.kind]}
                            </span>
                          </div>
                          <p className="text-ink">
                            <span className="text-muted">原文：</span>
                            {issue.original}
                          </p>
                          <p className={`mt-0.5 ${style.text}`}>
                            {issue.description}
                          </p>
                          {issue.suggestion && (
                            <p className="mt-0.5 text-muted">
                              建议：{issue.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 通过状态 */}
              {issues.length === 0 && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-xs text-emerald-700">
                    拼写检查通过，未发现错别字或用词问题。
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
