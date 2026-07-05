// 图表块 NodeView 组件
// 渲染图片(figure)或表格(table)+ 题注
// 通过 NodeViewWrapper 包装,支持选中/拖拽

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import type { Figure } from '@/types'
import { getFigure } from '@/services/figure/FigureService'

type FigureBlockAttrs = {
  figureId: string | null
  kind: 'figure' | 'table'
  label: string | null
}

export function FigureBlockView({ node, selected }: NodeViewProps) {
  const { figureId, kind } = node.attrs as FigureBlockAttrs
  const [figure, setFigure] = useState<Figure | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!figureId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getFigure(figureId).then((result) => {
      if (!cancelled) {
        if (result.ok) {
          setFigure(result.data)
        }
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [figureId])

  const numberLabel = figure?.number ? `${kind === 'figure' ? '图' : '表'} ${figure.number}` : ''

  return (
    <NodeViewWrapper className="figure-block-wrapper">
      <div
        className={`my-4 p-4 rounded-md transition-colors ${
          selected ? 'bg-brand-soft/30 ring-1 ring-brand' : 'bg-surface-2'
        }`}
      >
        {loading ? (
          <div className="text-center text-muted text-sm py-8">加载中...</div>
        ) : !figure ? (
          <div className="text-center text-danger text-sm py-8">图表数据加载失败</div>
        ) : kind === 'figure' ? (
          <FigureContent figure={figure} numberLabel={numberLabel} />
        ) : (
          <TableContent figure={figure} numberLabel={numberLabel} />
        )}
      </div>
    </NodeViewWrapper>
  )
}

/// 图片内容渲染
function FigureContent({ figure, numberLabel }: { figure: Figure; numberLabel: string }) {
  const imageSrc = figure.imageData
    ? `data:image/png;base64,${figure.imageData}`
    : figure.imagePath

  if (!imageSrc) {
    return (
      <div className="text-center text-muted text-sm py-8">
        {numberLabel}:图片数据缺失
      </div>
    )
  }

  return (
    <figure className="text-center">
      <img
        src={imageSrc}
        alt={figure.caption}
        className="max-w-full mx-auto rounded"
        style={{ maxHeight: '500px' }}
      />
      <figcaption className="mt-2 text-sm text-muted">
        <span className="font-medium">{numberLabel}</span>
        {figure.caption}
      </figcaption>
    </figure>
  )
}

/// 表格内容渲染
function TableContent({ figure, numberLabel }: { figure: Figure; numberLabel: string }) {
  const tableData = figure.tableData as { rows?: Array<Array<{ content?: string }>> } | null

  if (!tableData?.rows?.length) {
    return (
      <div className="text-center text-muted text-sm py-4">
        {numberLabel}:表格数据缺失
      </div>
    )
  }

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {tableData.rows.map((row, i) => (
            <tr key={i} className="border-b border-line">
              {row.map((cell, j) => (
                <td key={j} className="border border-line px-3 py-2">
                  {cell.content ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-sm text-muted text-center">
        <span className="font-medium">{numberLabel}</span>
        {figure.caption}
      </div>
    </div>
  )
}
