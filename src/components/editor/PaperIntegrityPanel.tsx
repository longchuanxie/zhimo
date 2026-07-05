// 论文完整性面板
// 对应任务：C.12 完整性面板
//
// 职责：
// - 调用 PaperService.getDocumentPaperMeta 加载文档论文元数据（统计 + 问题列表）
// - 展示统计：引文数 / 图数 / 表数 / 公式数 / 字数
// - 展示完整性问题：按严重度排序，orphan_citation 标红（阻断导出），其余黄色（警告）
// - 提供"重新检查"按钮
// - 可折叠，默认展开
//
// 依赖：PaperService.getDocumentPaperMeta

import { useState } from 'react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BookOpenIcon,
  PhotoIcon,
  TableCellsIcon,
  CalculatorIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { LoadingState } from '@/components/foundation/LoadingState'
import { AppIcon } from '@/components/foundation/AppIcon'
import { useAsync } from '@/hooks/useAsync'
import { getDocumentPaperMeta } from '@/services/paper/PaperService'
import type { IntegrityIssueType } from '@/types'

type Props = {
  documentId: string
  className?: string
}

/// 问题严重度映射：error 阻断导出，warning 仅警告
const ISSUE_SEVERITY: Record<IntegrityIssueType, 'error' | 'warning'> = {
  orphan_citation: 'error',
  invalid_latex: 'warning',
  label_duplicate: 'warning',
  missing_caption: 'warning',
  missing_source: 'warning',
  orphan_cross_ref: 'warning',
  number_conflict: 'warning',
}

/// 问题排序优先级（数字越小越靠前）
const ISSUE_ORDER: Record<IntegrityIssueType, number> = {
  orphan_citation: 0,
  invalid_latex: 1,
  label_duplicate: 2,
  missing_caption: 3,
  number_conflict: 4,
  missing_source: 5,
  orphan_cross_ref: 6,
}

type StatItem = {
  label: string
  value: number
  icon: typeof BookOpenIcon
}

export function PaperIntegrityPanel({ documentId, className }: Props) {
  const { state, refresh } = useAsync(
    () => getDocumentPaperMeta(documentId),
    [documentId],
  )
  const [expanded, setExpanded] = useState(true)

  const meta = state.status === 'success' ? state.data : null
  const issues = meta?.issues ?? []
  const errorCount = issues.filter(
    (i) => ISSUE_SEVERITY[i.type] === 'error',
  ).length
  const warningCount = issues.length - errorCount

  // 排序后的问题列表
  const sortedIssues = [...issues].sort(
    (a, b) => ISSUE_ORDER[a.type] - ISSUE_ORDER[b.type],
  )

  const stats: StatItem[] = meta
    ? [
        { label: '引文', value: meta.citationCount, icon: BookOpenIcon },
        { label: '图', value: meta.figureCount, icon: PhotoIcon },
        { label: '表', value: meta.tableCount, icon: TableCellsIcon },
        { label: '公式', value: meta.equationCount, icon: CalculatorIcon },
        { label: '字数', value: meta.wordCount, icon: DocumentTextIcon },
      ]
    : []

  // 折叠时的摘要
  const summary = (() => {
    if (state.status !== 'success') return null
    if (issues.length === 0) return '完整性检查通过'
    const parts: string[] = []
    if (errorCount > 0) parts.push(`${errorCount} 项错误`)
    if (warningCount > 0) parts.push(`${warningCount} 项警告`)
    return parts.join('，')
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
          <span className="text-sm font-medium text-ink">论文完整性</span>
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
            <LoadingState message="正在检查论文完整性..." />
          )}

          {state.status === 'error' && (
            <p className="text-sm text-danger">
              完整性检查失败：{state.error.message}
            </p>
          )}

          {state.status === 'success' && (
            <>
              {/* 统计区 */}
              <div className="flex items-center gap-4 flex-wrap">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center gap-1.5 text-xs text-muted"
                  >
                    <AppIcon icon={stat.icon} size="sm" className="text-subtle" />
                    <span>{stat.label}</span>
                    <span className="font-medium text-ink">{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* 问题列表 */}
              {sortedIssues.length > 0 && (
                <div className="space-y-1.5">
                  {sortedIssues.map((issue, idx) => {
                    const severity = ISSUE_SEVERITY[issue.type]
                    const isError = severity === 'error'
                    return (
                      <div
                        key={`${issue.type}-${issue.objectId ?? idx}`}
                        className={`flex items-start gap-2 p-2 rounded-md text-xs ${
                          isError
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-amber-50 border border-amber-200'
                        }`}
                      >
                        {isError ? (
                          <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={isError ? 'text-red-700' : 'text-amber-700'}
                          >
                            {issue.description}
                          </p>
                          {issue.suggestedAction && (
                            <p
                              className={`mt-0.5 ${
                                isError ? 'text-red-500' : 'text-amber-500'
                              }`}
                            >
                              建议：{issue.suggestedAction}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 通过状态 */}
              {sortedIssues.length === 0 && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-xs text-emerald-700">
                    论文完整性检查通过，未发现格式、引文、图表或公式问题。
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
