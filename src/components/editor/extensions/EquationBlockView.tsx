// 公式块 NodeView 组件
// 使用 KaTeX 渲染 LaTeX,显示公式编号
// 通过 NodeViewWrapper 包装,支持选中/拖拽

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { Equation } from '@/types'
import { getEquation } from '@/services/equation/EquationService'

type EquationBlockAttrs = {
  equationId: string | null
  latex: string
  label: string | null
}

export function EquationBlockView({ node, selected }: NodeViewProps) {
  const { equationId, latex } = node.attrs as EquationBlockAttrs
  const [equation, setEquation] = useState<Equation | null>(null)
  const [rendered, setRendered] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // 加载公式编号
  useEffect(() => {
    if (!equationId) return
    let cancelled = false
    getEquation(equationId).then((result) => {
      if (!cancelled && result.ok) {
        setEquation(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [equationId])

  // 渲染 LaTeX
  useEffect(() => {
    if (!latex) {
      setRendered('')
      setError(null)
      return
    }
    try {
      const html = katex.renderToString(latex, {
        throwOnError: true,
        displayMode: true,
      })
      setRendered(html)
      setError(null)
    } catch (e) {
      setRendered('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [latex])

  return (
    <NodeViewWrapper className="equation-block-wrapper">
      <div
        className={`flex items-center justify-center py-4 my-2 rounded-md transition-colors ${
          selected ? 'bg-brand-soft/30 ring-1 ring-brand' : 'bg-surface-2'
        }`}
      >
        <div className="flex-1 flex justify-center">
          {error ? (
            <span className="text-danger text-sm">公式语法错误: {error}</span>
          ) : (
            <div
              className="equation-content"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )}
        </div>
        {equation?.number && (
          <span className="text-muted text-sm pr-4">({equation.number})</span>
        )}
      </div>
    </NodeViewWrapper>
  )
}
