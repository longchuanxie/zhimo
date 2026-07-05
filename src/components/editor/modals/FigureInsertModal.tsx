// 图表/表格插入弹框
// 对应任务：C.7 图表插入
//
// 职责：
// - kind='figure': 选择图片 → base64 预览 → 填写 caption/label/note → 关联来源 → 创建 Figure → 插入 figureBlock
// - kind='table': 行列输入 + 单元格编辑 → 组装 TipTap Table JSON → 创建 Figure(table) → 插入 figureBlock
// - 共通：通过 SourcePickerModal 关联 sourceId（材料真实性弱约束，允许跳过）
//
// 依赖：FigureService.createFigure / pickImageAsBase64、FigureBlock.insertFigureBlock 命令、SourcePickerModal

import { useState, useEffect } from 'react'
import { PhotoIcon, TableCellsIcon, LinkIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/foundation/Modal'
import { SourcePickerModal } from '@/components/source/SourcePickerModal'
import { createFigure, pickImageAsBase64 } from '@/services/figure/FigureService'
import { toast } from '@/stores/toastStore'
import type { Editor } from '@tiptap/react'
import type { Source } from '@/types'

type Props = {
  editor: Editor | null
  documentId: string
  projectId: string
  open: boolean
  kind: 'figure' | 'table'
  onClose: () => void
}

/// 表格单元格内容（二维数组：rows × cols）
type TableGrid = string[][]

const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3
const MAX_ROWS = 20
const MAX_COLS = 10

export function FigureInsertModal({
  editor,
  documentId,
  projectId,
  open,
  kind,
  onClose,
}: Props) {
  // 共通字段
  const [caption, setCaption] = useState('')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [sourceTitle, setSourceTitle] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // figure 分支字段
  const [imageData, setImageData] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  // table 分支字段
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [cells, setCells] = useState<TableGrid>(() =>
    initGrid(DEFAULT_ROWS, DEFAULT_COLS),
  )

  // SourcePickerModal 开关
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)

  // open 变化时重置表单
  useEffect(() => {
    if (open) {
      setCaption('')
      setLabel('')
      setNote('')
      setSourceId(null)
      setSourceTitle(null)
      setImageData(null)
      setRows(DEFAULT_ROWS)
      setCols(DEFAULT_COLS)
      setCells(initGrid(DEFAULT_ROWS, DEFAULT_COLS))
    }
  }, [open, kind])

  const handlePickImage = async () => {
    setPicking(true)
    try {
      const result = await pickImageAsBase64()
      if (result.ok) {
        if (result.data) {
          setImageData(result.data.imageData)
          // 若 caption 为空，用文件名作为默认 caption 提示
          if (!caption) setCaption(result.data.fileName)
        }
        // null 表示用户取消，不提示
      } else {
        toast.error(`图片读取失败：${result.error.message}`)
      }
    } finally {
      setPicking(false)
    }
  }

  const handleResizeGrid = (newRows: number, newCols: number) => {
    const clampedRows = Math.max(1, Math.min(MAX_ROWS, newRows))
    const clampedCols = Math.max(1, Math.min(MAX_COLS, newCols))
    setRows(clampedRows)
    setCols(clampedCols)
    setCells(resizeGrid(cells, clampedRows, clampedCols))
  }

  const handleCellChange = (r: number, c: number, value: string) => {
    setCells((prev) => {
      const next = prev.map((row) => [...row])
      next[r]![c] = value
      return next
    })
  }

  const handleSourceSelect = (source: Source | null) => {
    if (source) {
      setSourceId(source.id)
      setSourceTitle(source.title)
    } else {
      // 用户选择"不关联来源"
      setSourceId(null)
      setSourceTitle(null)
    }
    setSourcePickerOpen(false)
  }

  const canSubmit = (() => {
    if (!caption.trim()) return false
    if (kind === 'figure') return !!imageData
    // table: 至少有一个非空单元格
    if (kind === 'table') return cells.some((row) => row.some((c) => c.trim()))
    return false
  })()

  const handleSubmit = async () => {
    if (!editor || !canSubmit) return
    setSubmitting(true)
    try {
      const input = {
        projectId,
        documentId,
        kind,
        caption: caption.trim(),
        label: label.trim() || null,
        note: note.trim() || null,
        sourceId,
        ...(kind === 'figure'
          ? { imageData }
          : { tableData: buildTableJson(cells) }),
      }

      const result = await createFigure(input)
      if (result.ok) {
        editor
          .chain()
          .focus()
          .insertFigureBlock({
            figureId: result.data.id,
            kind,
            label: result.data.label,
          })
          .run()
        toast.success(kind === 'figure' ? '图片已插入' : '表格已插入')
        onClose()
      } else {
        toast.error(`插入失败：${result.error.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const kindLabel = kind === 'figure' ? '图片' : '表格'
  const KindIcon = kind === 'figure' ? PhotoIcon : TableCellsIcon

  return (
    <>
      <Modal
        title={`插入${kindLabel}`}
        open={open}
        onClose={onClose}
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '插入中...' : `插入${kindLabel}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* figure 分支：图片选择 */}
          {kind === 'figure' && (
            <div>
              <label className="text-xs text-muted block mb-1">
                选择图片 <span className="text-danger">*</span>
              </label>
              {imageData ? (
                <div className="border border-line rounded-md p-3 bg-surface-2/50">
                  <img
                    src={`data:image/png;base64,${imageData}`}
                    alt="预览"
                    className="max-h-48 mx-auto rounded"
                  />
                  <button
                    type="button"
                    className="btn-ghost mt-2 text-xs"
                    onClick={handlePickImage}
                    disabled={picking}
                  >
                    {picking ? '选择中...' : '重新选择'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full border-2 border-dashed border-line rounded-md p-6 hover:border-brand hover:bg-brand-soft/20 transition-colors flex flex-col items-center gap-2"
                  onClick={handlePickImage}
                  disabled={picking}
                >
                  <PhotoIcon className="w-8 h-8 text-muted" />
                  <span className="text-sm text-muted">
                    {picking ? '选择中...' : '点击选择图片文件'}
                  </span>
                  <span className="text-xs text-subtle">
                    支持 PNG / JPG / GIF / WebP / BMP
                  </span>
                </button>
              )}
            </div>
          )}

          {/* table 分支：表格编辑器 */}
          {kind === 'table' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">行数</label>
                  <input
                    type="number"
                    className="input w-20"
                    min={1}
                    max={MAX_ROWS}
                    value={rows}
                    onChange={(e) =>
                      handleResizeGrid(Number(e.target.value), cols)
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">列数</label>
                  <input
                    type="number"
                    className="input w-20"
                    min={1}
                    max={MAX_COLS}
                    value={cols}
                    onChange={(e) =>
                      handleResizeGrid(rows, Number(e.target.value))
                    }
                  />
                </div>
              </div>
              <div className="overflow-auto border border-line rounded-md max-h-64">
                <table className="w-full border-collapse">
                  <tbody>
                    {cells.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className="border border-line p-0 align-top"
                          >
                            <textarea
                              className="w-full min-h-[40px] p-1 text-xs resize-none bg-transparent focus:bg-brand-soft/20 focus:outline-none"
                              value={cell}
                              onChange={(e) =>
                                handleCellChange(r, c, e.target.value)
                              }
                              placeholder="单元格"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 共通字段 */}
          <div>
            <label className="text-xs text-muted block mb-1">
              题注 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                kind === 'figure' ? '如 图1：系统架构图' : '如 表1：实验数据对比'
              }
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">
                标签（可选）
              </label>
              <input
                type="text"
                className="input w-full"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={
                  kind === 'figure' ? '如 fig:architecture' : '如 tab:results'
                }
                maxLength={50}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">
                来源资料（可选）
              </label>
              <button
                type="button"
                className="input w-full text-left flex items-center gap-2"
                onClick={() => setSourcePickerOpen(true)}
              >
                <LinkIcon className="w-4 h-4 text-muted flex-shrink-0" />
                <span className="flex-1 truncate text-sm">
                  {sourceTitle ?? '点击关联来源资料'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">
              备注（可选）
            </label>
            <textarea
              className="input w-full min-h-[60px] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="对图表的补充说明"
              maxLength={500}
            />
          </div>

          {/* 材料真实性提示 */}
          <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
            <KindIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              建议关联来源资料以保障材料真实性。未关联来源的图表在完整性检查中会标记为警告。
            </p>
          </div>
        </div>
      </Modal>

      <SourcePickerModal
        projectId={projectId}
        open={sourcePickerOpen}
        onSelect={handleSourceSelect}
        onClose={() => setSourcePickerOpen(false)}
        allowSkip
      />
    </>
  )
}

// ============ 工具函数 ============

function initGrid(rows: number, cols: number): TableGrid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ''),
  )
}

function resizeGrid(grid: TableGrid, rows: number, cols: number): TableGrid {
  const next: TableGrid = []
  for (let r = 0; r < rows; r++) {
    const row: string[] = []
    for (let c = 0; c < cols; c++) {
      row.push(grid[r]?.[c] ?? '')
    }
    next.push(row)
  }
  return next
}

/// 将单元格二维数组组装为 TipTap Table JSON
function buildTableJson(cells: TableGrid): unknown {
  return {
    type: 'table',
    content: cells.map((row) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: 'tableCell',
        content: cell.trim()
          ? [{ type: 'paragraph', content: [{ type: 'text', text: cell }] }]
          : [{ type: 'paragraph' }],
      })),
    })),
  }
}
