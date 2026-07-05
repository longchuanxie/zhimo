// 导出向导弹窗
// 对应任务：DEV-084
//
// 职责：
// - 选择导出范围（整项目 / 当前文档 / 大纲范围）
// - 选择导出格式（Markdown / TXT / Word / LaTeX / DOCX）
// - 选择具体文档或大纲节点
// - LaTeX/DOCX 提供高级导出选项（引用格式/图表/目录/字体字号行距页边距）
// - 确认后触发导出

import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline'
import { open } from '@tauri-apps/plugin-dialog'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import {
  listDocuments,
} from '@/services/database/documentRepository'
import {
  listOutlineNodesByProject,
} from '@/services/database/outlineRepository'
import {
  EXPORT_FORMAT_LABEL,
  CITATION_STYLE_LABEL,
} from '@/constants/status'
import type {
  ExportScope,
  ExportFormat,
  ExportOptions,
  CitationStyle,
  Document,
  OutlineNode,
} from '@/types'

type Props = {
  projectId: string
  creating: boolean
  onConfirm: (input: {
    exportScope: ExportScope
    exportFormat: ExportFormat
    documentIds?: string[]
    outlineNodeIds?: string[]
    targetDirectory?: string
    exportOptions?: ExportOptions
  }) => void
  onCancel: () => void
}

const SCOPE_OPTIONS: Array<{
  value: ExportScope
  label: string
  description: string
  icon: typeof FolderIcon
}> = [
  {
    value: 'whole_project',
    label: '整项目',
    description: '导出项目内所有文档',
    icon: FolderIcon,
  },
  {
    value: 'current_document',
    label: '指定文档',
    description: '选择一个或多个文档导出',
    icon: DocumentTextIcon,
  },
  {
    value: 'outline_scope',
    label: '大纲范围',
    description: '按大纲节点导出关联文档',
    icon: ListBulletIcon,
  },
]

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'markdown', label: EXPORT_FORMAT_LABEL.markdown, hint: '.md 文件，适合二次编辑' },
  { value: 'txt', label: EXPORT_FORMAT_LABEL.txt, hint: '.txt 纯文本，适合通用阅读和粘贴' },
  { value: 'word', label: EXPORT_FORMAT_LABEL.word, hint: '.doc 文件，适合直接阅读' },
  { value: 'latex', label: EXPORT_FORMAT_LABEL.latex, hint: '.tex 源码，适合学术论文排版' },
  { value: 'docx', label: EXPORT_FORMAT_LABEL.docx, hint: '.docx 文件，含完整排版样式' },
]

/// 默认导出选项（与 ExportService.DEFAULT_EXPORT_OPTIONS 保持一致）
const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  citationStyle: 'gbt7714_2015',
  includeFigures: true,
  includeTOC: false,
  fontFamily: '宋体',
  fontSize: 12,
  lineHeight: 1.5,
  margin: { top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
}

/// 判断格式是否支持高级导出选项
function isPaperFormat(format: ExportFormat): boolean {
  return format === 'latex' || format === 'docx'
}

export function ExportWizardModal({
  projectId,
  creating,
  onConfirm,
  onCancel,
}: Props) {
  const [scope, setScope] = useState<ExportScope>('whole_project')
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [documents, setDocuments] = useState<Document[]>([])
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [targetDirectory, setTargetDirectory] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // 导出选项（仅 latex/docx 使用）
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS)

  // 加载文档和大纲节点列表
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [docs, nodes] = await Promise.all([
          listDocuments(projectId),
          listOutlineNodesByProject(projectId),
        ])
        if (!cancelled) {
          setDocuments(docs.filter((d) => !d.isDeleted))
          setOutlineNodes(nodes.filter((n) => !n.isDeleted))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleNode = (id: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canConfirm = () => {
    if (scope === 'current_document') return selectedDocIds.size > 0
    if (scope === 'outline_scope') return selectedNodeIds.size > 0
    return true
  }

  const handleSelectDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择导出目录',
    })
    if (selected && typeof selected === 'string') {
      setTargetDirectory(selected)
    }
  }

  const handleConfirm = () => {
    onConfirm({
      exportScope: scope,
      exportFormat: format,
      documentIds:
        scope === 'current_document' ? Array.from(selectedDocIds) : undefined,
      outlineNodeIds:
        scope === 'outline_scope' ? Array.from(selectedNodeIds) : undefined,
      targetDirectory: targetDirectory || undefined,
      // 仅论文格式传导出选项，markdown/word 不需要
      exportOptions: isPaperFormat(format) ? exportOptions : undefined,
    })
  }

  // 步骤编号动态计算：whole_project 无需选对象，步骤少 1 步
  const hasObjectStep = scope !== 'whole_project'
  const formatStep = hasObjectStep ? 3 : 2
  const optionsStep = formatStep + 1
  const dirStep = isPaperFormat(format) ? optionsStep + 1 : optionsStep

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
      <div className="w-[600px] max-h-[85vh] bg-surface rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-line">
          <h3 className="text-base font-bold text-ink">导出向导</h3>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onCancel}
            disabled={creating}
            aria-label="关闭"
          >
            <AppIcon icon={XMarkIcon} size="sm" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          {/* 步骤 1：选择范围 */}
          <section>
            <h4 className="text-sm font-semibold text-ink mb-2">1. 选择导出范围</h4>
            <div className="space-y-2">
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    scope === option.value
                      ? 'border-brand bg-brand-soft/50'
                      : 'border-line hover:bg-surface-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="mt-1"
                  />
                  <AppIcon
                    icon={option.icon}
                    size="sm"
                    className="text-muted mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{option.label}</div>
                    <div className="text-xs text-muted mt-0.5">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* 步骤 2：选择具体对象（条件渲染） */}
          {scope === 'current_document' && (
            <section>
              <h4 className="text-sm font-semibold text-ink mb-2">
                2. 选择文档（已选 {selectedDocIds.size} 个）
              </h4>
              {loading ? (
                <LoadingState message="加载文档列表..." />
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">暂无可导出的文档</p>
              ) : (
                <div className="max-h-48 overflow-auto border border-line rounded-md divide-y divide-line">
                  {documents.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                      />
                      <span className="text-sm text-ink flex-1 truncate">{doc.title}</span>
                      <span className="text-xs text-subtle">{doc.wordCount} 字</span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}

          {scope === 'outline_scope' && (
            <section>
              <h4 className="text-sm font-semibold text-ink mb-2">
                2. 选择大纲节点（已选 {selectedNodeIds.size} 个）
              </h4>
              {loading ? (
                <LoadingState message="加载大纲列表..." />
              ) : outlineNodes.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">暂无大纲节点</p>
              ) : (
                <div className="max-h-48 overflow-auto border border-line rounded-md divide-y divide-line">
                  {outlineNodes.map((node) => (
                    <label
                      key={node.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedNodeIds.has(node.id)}
                        onChange={() => toggleNode(node.id)}
                      />
                      <span
                        className="text-sm text-ink flex-1 truncate"
                        style={{ paddingLeft: `${node.depth * 12}px` }}
                      >
                        {node.title}
                      </span>
                      {!node.linkedDocumentId && (
                        <span className="text-xs text-subtle">未关联文档</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 步骤：选择格式 */}
          <section>
            <h4 className="text-sm font-semibold text-ink mb-2">
              {formatStep}. 选择导出格式
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex flex-col p-3 rounded-md border cursor-pointer transition-colors ${
                    format === option.value
                      ? 'border-brand bg-brand-soft/50'
                      : 'border-line hover:bg-surface-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={option.value}
                    checked={format === option.value}
                    onChange={() => setFormat(option.value)}
                    className="mb-1"
                  />
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  <span className="text-xs text-muted mt-0.5">{option.hint}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 步骤：导出选项（仅 latex/docx 显示） */}
          {isPaperFormat(format) && (
            <section className="p-3 bg-surface-2/50 rounded-md border border-line">
              <h4 className="text-sm font-semibold text-ink mb-3">
                {optionsStep}. 导出选项
              </h4>
              <div className="space-y-3">
                {/* 引用格式 */}
                <div>
                  <label className="text-xs text-muted block mb-1">引用格式</label>
                  <select
                    className="input w-full"
                    value={exportOptions.citationStyle ?? 'gbt7714_2015'}
                    onChange={(e) =>
                      setExportOptions({
                        ...exportOptions,
                        citationStyle: e.target.value as CitationStyle,
                      })
                    }
                  >
                    {(Object.keys(CITATION_STYLE_LABEL) as CitationStyle[]).map((style) => (
                      <option
                        key={style}
                        value={style}
                        disabled={style !== 'gbt7714_2015'}
                      >
                        {CITATION_STYLE_LABEL[style]}
                        {style !== 'gbt7714_2015' ? '（即将支持）' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 是否包含图表 / 目录 */}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeFigures}
                      onChange={(e) =>
                        setExportOptions({
                          ...exportOptions,
                          includeFigures: e.target.checked,
                        })
                      }
                    />
                    包含图表
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeTOC}
                      onChange={(e) =>
                        setExportOptions({
                          ...exportOptions,
                          includeTOC: e.target.checked,
                        })
                      }
                    />
                    包含目录
                  </label>
                </div>

                {/* 字体/字号/行距/页边距（仅 docx 显示） */}
                {format === 'docx' && (
                  <div className="border-t border-line pt-3 space-y-3">
                    <div className="text-xs text-muted">排版样式（仅 DOCX 生效）</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted block mb-1">字体</label>
                        <input
                          type="text"
                          className="input w-full"
                          value={exportOptions.fontFamily}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              fontFamily: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">字号(pt)</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={8}
                          max={36}
                          value={exportOptions.fontSize}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              fontSize: Number(e.target.value) || 12,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">行距</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={1}
                          max={3}
                          step={0.1}
                          value={exportOptions.lineHeight}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              lineHeight: Number(e.target.value) || 1.5,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted block mb-1">上边距(cm)</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={0}
                          step={0.1}
                          value={exportOptions.margin.top}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              margin: {
                                ...exportOptions.margin,
                                top: Number(e.target.value) || 2.54,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">下边距(cm)</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={0}
                          step={0.1}
                          value={exportOptions.margin.bottom}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              margin: {
                                ...exportOptions.margin,
                                bottom: Number(e.target.value) || 2.54,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">左边距(cm)</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={0}
                          step={0.1}
                          value={exportOptions.margin.left}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              margin: {
                                ...exportOptions.margin,
                                left: Number(e.target.value) || 3.18,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">右边距(cm)</label>
                        <input
                          type="number"
                          className="input w-full"
                          min={0}
                          step={0.1}
                          value={exportOptions.margin.right}
                          onChange={(e) =>
                            setExportOptions({
                              ...exportOptions,
                              margin: {
                                ...exportOptions.margin,
                                right: Number(e.target.value) || 3.18,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 步骤：选择导出目录 */}
          <section>
            <h4 className="text-sm font-semibold text-ink mb-2">
              {dirStep}. 选择导出目录
            </h4>
            <div className="space-y-2">
              <button
                type="button"
                className="btn-secondary w-full flex items-center justify-center gap-2 px-3 py-2"
                onClick={handleSelectDirectory}
                disabled={creating}
              >
                <AppIcon icon={FolderOpenIcon} size="sm" />
                {targetDirectory ? '更换目录' : '选择导出目录'}
              </button>
              {targetDirectory ? (
                <p
                  className="text-xs text-muted break-all bg-surface-2 px-3 py-2 rounded-md"
                  title={targetDirectory}
                >
                  {targetDirectory}
                </p>
              ) : (
                <p className="text-xs text-subtle">
                  未指定时将保存到项目默认导出目录
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-5 h-16 border-t border-line">
          <button
            type="button"
            className="btn-ghost px-4 py-2"
            onClick={onCancel}
            disabled={creating}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2"
            onClick={handleConfirm}
            disabled={!canConfirm() || creating}
          >
            {creating ? '导出中...' : '开始导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
