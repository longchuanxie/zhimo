// 上下文预览面板 v2
// 对应任务：DEV-079
// 展示"本次参考内容"，允许用户查看、排除、确认
//
// 设计说明：
// - Token 进度条直观显示上下文消耗
// - 任务类型标签显示当前任务
// - 必选项/可选项分组显示
// - 智能提示上下文消耗情况
// - 根据任务类型差异化显示上下文项

import { useState, useMemo } from 'react'
import {
  LockClosedIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  PaperClipIcon,
  Squares2X2Icon,
  BookOpenIcon,
  ListBulletIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { AppIcon } from '@/components/foundation/AppIcon'
import type { ContextPreview, ContextEntry, ContextEntryKind, AgentTaskType } from '@/types'

// ============ 常量定义 ============

const KIND_ICON: Record<ContextEntryKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  user_instruction: ClipboardDocumentIcon,
  selected_text: DocumentTextIcon,
  project_rules: ShieldCheckIcon,
  document: DocumentTextIcon,
  source: PaperClipIcon,
  source_chunk: PaperClipIcon,
  card: Squares2X2Icon,
  knowledge: BookOpenIcon,
  outline_node: ListBulletIcon,
  previous_message: ChatBubbleLeftRightIcon,
  agent_memory: SparklesIcon,
  agent_thread_state: ChatBubbleLeftRightIcon,
}

const KIND_LABEL: Record<ContextEntryKind, string> = {
  user_instruction: '用户指令',
  selected_text: '当前选区',
  project_rules: '项目规则',
  document: '文档',
  source: '资料',
  source_chunk: '资料片段',
  card: '卡片',
  knowledge: '知识',
  outline_node: '大纲节点',
  previous_message: '历史对话',
  agent_memory: '记忆',
  agent_thread_state: '多轮状态',
}

/// 任务类型 UI 配置
const TASK_TYPE_CONFIG: Record<AgentTaskType, {
  label: string
  badgeClass: string
  showOptional: boolean
  expandOptionalByDefault: boolean
  detailMode: 'compact' | 'standard' | 'explicit'
  riskHint?: string
}> = {
  rewrite: {
    label: '改写',
    badgeClass: 'bg-purple-500',
    showOptional: false,
    expandOptionalByDefault: false,
    detailMode: 'compact',
  },
  summarize: {
    label: '摘要',
    badgeClass: 'bg-blue-500',
    showOptional: false,
    expandOptionalByDefault: false,
    detailMode: 'compact',
  },
  format_text: {
    label: '格式化',
    badgeClass: 'bg-gray-500',
    showOptional: false,
    expandOptionalByDefault: false,
    detailMode: 'compact',
  },
  generate_card: {
    label: '生成卡片',
    badgeClass: 'bg-green-500',
    showOptional: true,
    expandOptionalByDefault: true,
    detailMode: 'explicit',
    riskHint: '此任务可能创建新的卡片草稿，请确认参考内容与来源范围。',
  },
  answer_question: {
    label: '问答',
    badgeClass: 'bg-cyan-500',
    showOptional: true,
    expandOptionalByDefault: false,
    detailMode: 'standard',
  },
  expand: {
    label: '扩写',
    badgeClass: 'bg-orange-500',
    showOptional: true,
    expandOptionalByDefault: false,
    detailMode: 'standard',
  },
  check_source: {
    label: '检查来源',
    badgeClass: 'bg-red-500',
    showOptional: true,
    expandOptionalByDefault: true,
    detailMode: 'explicit',
    riskHint: '此任务会基于资料、卡片和知识判断来源支撑，请确认不相关内容已排除。',
  },
  generate_outline: {
    label: '生成大纲',
    badgeClass: 'bg-yellow-500',
    showOptional: true,
    expandOptionalByDefault: true,
    detailMode: 'explicit',
    riskHint: '此任务可能创建或调整大纲结构，请先确认参考资料和已有大纲范围。',
  },
}

/// Token 建议上限
const TOKEN_SUGGESTED_LIMIT = 6000

// ============ Props ============

type ContextPreviewPanelProps = {
  preview: ContextPreview
  /// 确认创建 ContextPack 并继续
  onCreateContextPack: (excludedRefIds: string[]) => void
  /// 取消
  onCancel: () => void
  /// 是否正在创建
  creating?: boolean
  /// 中止正在进行的生成（仅在 creating 时可用）
  onAbort?: () => void
}

// ============ 主组件 ============

export function ContextPreviewPanel({
  preview,
  onCreateContextPack,
  onCancel,
  creating = false,
  onAbort,
}: ContextPreviewPanelProps) {
  // 用户排除的 refId 集合
  const [excludedRefIds, setExcludedRefIds] = useState<Set<string>>(
    new Set(
      preview.entries
        .filter((e) => e.excluded && !e.required)
        .map((e) => e.refId)
        .filter((x): x is string => !!x),
    ),
  )

  // 可选项折叠状态
  const taskConfig = TASK_TYPE_CONFIG[preview.taskType]
  const [optionalExpanded, setOptionalExpanded] = useState(
    taskConfig?.expandOptionalByDefault ?? false,
  )

  // 必选项默认收起，避免面板过长遮挡正文
  const [requiredExpanded, setRequiredExpanded] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(
    (taskConfig?.detailMode ?? 'standard') !== 'compact',
  )

  const toggleExclude = (entry: ContextEntry) => {
    if (entry.required || !entry.refId) return
    const refId = entry.refId
    setExcludedRefIds((prev) => {
      const next = new Set(prev)
      if (next.has(refId)) {
        next.delete(refId)
      } else {
        next.add(refId)
      }
      return next
    })
  }

  // 计算实际 token
  const totalTokens = useMemo(() => {
    return preview.entries
      .filter((e) => {
        if (e.required) return true
        if (!e.refId) return true
        return !excludedRefIds.has(e.refId)
      })
      .reduce((sum, e) => sum + e.tokenEstimate, 0)
  }, [preview.entries, excludedRefIds])

  // 分组条目
  const { requiredEntries, optionalEntries, groupedOptional } = useMemo(() => {
    const required = preview.entries.filter((e) => e.required)
    const optional = preview.entries.filter((e) => !e.required)

    // 按类型分组
    const groups = new Map<ContextEntryKind, ContextEntry[]>()
    for (const entry of optional) {
      const kind = entry.kind
      if (!groups.has(kind)) {
        groups.set(kind, [])
      }
      groups.get(kind)!.push(entry)
    }

    return { requiredEntries: required, optionalEntries: optional, groupedOptional: groups }
  }, [preview.entries])

  // 计算活跃项数
  const activeCount = preview.entries.filter((e) => {
    if (e.required) return true
    if (!e.refId) return true
    return !excludedRefIds.has(e.refId)
  }).length

  // Token 消耗比例
  const tokenPercent = Math.min((totalTokens / TOKEN_SUGGESTED_LIMIT) * 100, 100)

  // 智能提示
  const smartHint = useMemo(() => {
    if (totalTokens > 10000) {
      return { type: 'error' as const, message: `上下文过大（${totalTokens} tokens），可能影响响应速度和生成质量，建议精简` }
    }
    if (totalTokens > 8000) {
      return { type: 'warning' as const, message: `上下文较大（${totalTokens} tokens），建议排除不相关内容以提升响应质量` }
    }
    if (optionalEntries.length > 10) {
      return { type: 'hint' as const, message: `建议排除不相关的 ${optionalEntries.length} 项参考内容` }
    }
    return null
  }, [totalTokens, optionalEntries.length])

  const activeEntries = useMemo(() => {
    return preview.entries.filter((e) => {
      if (e.required) return true
      if (!e.refId) return true
      return !excludedRefIds.has(e.refId)
    })
  }, [preview.entries, excludedRefIds])

  const kindSummary = useMemo(() => summarizeKinds(activeEntries), [activeEntries])
  const detailMode = taskConfig?.detailMode ?? 'standard'

  return (
    <div className="flex flex-col h-full">
      {/* 头部：标题 + 任务类型标签 */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ink">本次参考内容</h3>
          {taskConfig && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium text-white ${taskConfig.badgeClass}`}>
              {taskConfig.label}
            </span>
          )}
        </div>
      </div>

      <ContextSummaryBand
        detailMode={detailMode}
        kindSummary={kindSummary}
        tokens={totalTokens}
        itemCount={activeCount}
        detailsExpanded={detailsExpanded}
        onToggleDetails={() => setDetailsExpanded((v) => !v)}
      />

      {taskConfig?.riskHint && (
        <RiskHintBanner message={taskConfig.riskHint} />
      )}

      {detailsExpanded ? (
        <>
          {/* Token 进度条 */}
          <TokenProgressBar tokens={totalTokens} percent={tokenPercent} itemCount={activeCount} />

          {/* 自动压缩信息 */}
          {preview.compactionInfo && (
            <CompactionBanner compactionInfo={preview.compactionInfo} />
          )}

          {/* 必选项分组：默认收起，可点击展开 */}
          <div className="px-4 py-3 border-b border-line">
            <button
              type="button"
              className="flex items-center gap-1.5 mb-2 w-full text-left"
              onClick={() => setRequiredExpanded(!requiredExpanded)}
            >
              {requiredExpanded ? (
                <ChevronDownIcon className="w-4 h-4 text-muted" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-muted" />
              )}
              <span className="text-xs font-semibold text-muted">必选（不可排除）</span>
              <span className="text-xs text-subtle">· {requiredEntries.length} 项</span>
            </button>
            {requiredExpanded && (
              <div className="space-y-2">
                {requiredEntries.map((entry, idx) => (
                  <ContextEntryItem
                    key={`required-${entry.kind}-${entry.refId ?? idx}`}
                    entry={entry}
                    excluded={false}
                    onToggle={() => {}}
                    indent/>
                ))}
              </div>
            )}
          </div>

          {/* 可选项分组 */}
          {taskConfig?.showOptional && optionalEntries.length > 0 ? (
            <div className="px-4 py-3 flex-1 overflow-auto">
              <button
                type="button"
                className="flex items-center gap-1.5 mb-2 w-full text-left"
                onClick={() => setOptionalExpanded(!optionalExpanded)}
              >
                {optionalExpanded ? (
                  <ChevronDownIcon className="w-4 h-4 text-muted" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-muted" />
                )}
                <span className="text-xs font-semibold text-muted">可选</span>
                <span className="text-xs text-subtle">· {optionalEntries.length} 项</span>
              </button>

              {optionalExpanded && (
                <div className="space-y-2">
                  {/* 按类型分组显示 */}
                  {Array.from(groupedOptional.entries()).map(([kind, entries]) => (
                    <div key={kind} className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5 ml-6">
                        <AppIcon icon={KIND_ICON[kind]} size="xs" className="text-subtle" />
                        <span className="text-xs font-medium text-subtle">
                          {KIND_LABEL[kind]}（{entries.length} 项）
                        </span>
                      </div>
                      {entries.map((entry) => (
                        <ContextEntryItem
                          key={`optional-${entry.kind}-${entry.refId}`}
                          entry={entry}
                          excluded={
                            !!entry.refId && excludedRefIds.has(entry.refId)
                          }
                          onToggle={() => toggleExclude(entry)}
                          indent
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </>
      ) : (
        <CompactContextBody entries={activeEntries} />
      )}

      {/* 智能提示 */}
      {smartHint && (
        <SmartHint type={smartHint.type} message={smartHint.message} />
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={onCancel}
          disabled={creating}
        >
          取消
        </button>
        {creating && onAbort ? (
          <button
            type="button"
            className="btn-danger px-3 py-1"
            onClick={onAbort}
          >
            <AppIcon icon={XCircleIcon} size="sm" />
            中止生成
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCreateContextPack(Array.from(excludedRefIds))}
            disabled={creating || activeCount === 0}
          >
            <AppIcon icon={CheckCircleIcon} size="sm" />
            {creating ? '生成中...' : `确认并发送（${activeCount} 项）`}
          </button>
        )}
      </div>
    </div>
  )
}

type ContextSummaryBandProps = {
  detailMode: 'compact' | 'standard' | 'explicit'
  kindSummary: string
  tokens: number
  itemCount: number
  detailsExpanded: boolean
  onToggleDetails: () => void
}

function ContextSummaryBand({
  detailMode,
  kindSummary,
  tokens,
  itemCount,
  detailsExpanded,
  onToggleDetails,
}: ContextSummaryBandProps) {
  const label =
    detailMode === 'compact'
      ? '轻量任务：已自动精简参考范围'
      : detailMode === 'explicit'
        ? '高影响任务：发送前请确认参考范围'
        : '已准备本轮参考内容'

  return (
    <div className="border-b border-line bg-surface-2/30 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-xs text-muted">
            {kindSummary || '暂无参考摘要'} · 约 {tokens.toLocaleString()} tokens · {itemCount} 项
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 px-2 py-1 text-xs"
          onClick={onToggleDetails}
        >
          {detailsExpanded ? '收起详情' : '查看详情'}
        </button>
      </div>
    </div>
  )
}

function RiskHintBanner({ message }: { message: string }) {
  return (
    <div className="mx-4 my-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
      <div className="flex items-start gap-2">
        <AppIcon
          icon={ExclamationTriangleIcon}
          size="sm"
          className="mt-0.5 shrink-0 text-yellow-700"
        />
        <p className="text-xs text-yellow-700">{message}</p>
      </div>
    </div>
  )
}

function CompactContextBody({ entries }: { entries: ContextEntry[] }) {
  const visibleEntries = entries.slice(0, 4)

  return (
    <div className="flex-1 overflow-auto px-4 py-3">
      <div className="space-y-2">
        {visibleEntries.map((entry, idx) => (
          <div key={`${entry.kind}-${entry.refId ?? idx}`} className="flex items-start gap-2 rounded-md bg-surface px-3 py-2">
            <AppIcon icon={KIND_ICON[entry.kind]} size="sm" className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">
                {KIND_LABEL[entry.kind]} · {entry.title}
              </p>
              {entry.preview && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                  {entry.preview}
                </p>
              )}
            </div>
          </div>
        ))}
        {entries.length > visibleEntries.length && (
          <p className="px-1 text-xs text-subtle">
            还有 {entries.length - visibleEntries.length} 项参考内容，可展开详情查看。
          </p>
        )}
      </div>
    </div>
  )
}

function summarizeKinds(entries: ContextEntry[]): string {
  const counts = new Map<ContextEntryKind, number>()
  for (const entry of entries) {
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([kind, count]) => `${KIND_LABEL[kind]} ${count}`)
    .join(' / ')
}

// ============ 子组件：Token 进度条 ============

type TokenProgressBarProps = {
  tokens: number
  percent: number
  itemCount: number
}

function TokenProgressBar({ tokens, percent, itemCount }: TokenProgressBarProps) {
  // 颜色根据消耗比例变化
  const barColor = useMemo(() => {
    if (percent > 80) return 'bg-red-500'
    if (percent > 50) return 'bg-orange-500'
    return 'bg-brand'
  }, [percent])

  return (
    <div className="px-4 py-2 border-b border-line bg-surface-2/30">
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-1.5 flex-1 rounded-full bg-line overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>约 {tokens.toLocaleString()} tokens</span>
        <span>{percent.toFixed(0)}% · {itemCount} 项</span>
      </div>
    </div>
  )
}

// ============ 子组件：智能提示 ============

type HintType = 'info' | 'warning' | 'error' | 'hint'

type SmartHintProps = {
  type: HintType
  message: string
}

const HINT_CONFIG: Record<HintType, {
  bg: string
  border: string
  text: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}> = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: InformationCircleIcon,
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: ExclamationTriangleIcon,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: ExclamationTriangleIcon,
  },
  hint: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-600',
    icon: InformationCircleIcon,
  },
}

function SmartHint({ type, message }: SmartHintProps) {
  const config = HINT_CONFIG[type]

  return (
    <div className={`mx-4 my-2 px-3 py-2 rounded-md border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2">
        <AppIcon icon={config.icon} size="sm" className={`${config.text} flex-shrink-0 mt-0.5`} />
        <p className={`text-xs ${config.text}`}>{message}</p>
      </div>
    </div>
  )
}

// ============ 子组件：自动压缩信息 ============

type CompactionBannerProps = {
  compactionInfo: NonNullable<ContextPreview['compactionInfo']>
}

function CompactionBanner({ compactionInfo }: CompactionBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const { originalTokens, compactedTokens, compactedItems } = compactionInfo
  const savedTokens = originalTokens - compactedTokens

  return (
    <div className="mx-4 my-2 px-3 py-2 rounded-md border bg-blue-50 border-blue-200">
      <button
        type="button"
        className="flex items-start gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <AppIcon
          icon={InformationCircleIcon}
          size="sm"
          className="text-blue-700 flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-700">
            已自动压缩 {compactedItems.length} 项参考内容（{originalTokens.toLocaleString()} →{' '}
            {compactedTokens.toLocaleString()} tokens，节省 {savedTokens.toLocaleString()}）以适配模型上限
          </p>
          {compactedItems.length > 0 && (
            <span className="text-xs text-blue-500 underline">
              {expanded ? '收起详情' : '查看详情'}
            </span>
          )}
        </div>
      </button>
      {expanded && compactedItems.length > 0 && (
        <div className="mt-2 ml-6 space-y-1">
          {compactedItems.map((item, idx) => (
            <div key={idx} className="text-xs text-blue-600">
              · {item.title}：
              <span className={item.action === 'excluded' ? 'text-red-500' : 'text-orange-500'}>
                {item.action === 'excluded' ? '已排除' : '已截断'}
              </span>
              （{item.originalTokens} → {item.newTokens} tokens）
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 子组件：上下文条目 ============

type ContextEntryItemProps = {
  entry: ContextEntry
  excluded: boolean
  onToggle: () => void
  indent?: boolean
}

function ContextEntryItem({
  entry,
  excluded,
  onToggle,
  indent = false,
}: ContextEntryItemProps) {
  const Icon = KIND_ICON[entry.kind]

  return (
    <div
      className={`rounded-md border px-3 py-2 transition-colors ${
        excluded
          ? 'border-line bg-surface-2/30 opacity-60'
          : 'border-line bg-surface'
      } ${indent ? 'ml-6' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* 复选框 / 锁定图标 */}
        <button
          type="button"
          className="mt-0.5 flex-shrink-0"
          onClick={onToggle}
          disabled={entry.required}
          aria-label={entry.required ? '必选项' : excluded ? '恢复' : '排除'}
        >
          {entry.required ? (
            <AppIcon
              icon={LockClosedIcon}
              size="sm"
              className="text-subtle"
            />
          ) : excluded ? (
            <AppIcon
              icon={XCircleIcon}
              size="sm"
              className="text-subtle"
            />
          ) : (
            <AppIcon
              icon={CheckCircleIcon}
              size="sm"
              className="text-brand"
            />
          )}
        </button>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AppIcon icon={Icon} size="sm" className="text-muted flex-shrink-0" />
            <span className="text-xs font-semibold text-muted">
              {KIND_LABEL[entry.kind]}
            </span>
            {entry.statusLabel && (
              <span className="text-xs text-subtle">· {entry.statusLabel}</span>
            )}
            <span className="text-xs text-subtle ml-auto">
              ~{entry.tokenEstimate}t
            </span>
          </div>
          <div className="text-sm font-medium text-ink truncate">
            {entry.title}
          </div>
          {entry.preview && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">
              {entry.preview}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
