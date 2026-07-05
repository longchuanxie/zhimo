// 图表块 Node 扩展
// 块级 atom node,通过 figureId 关联数据库 Figure 记录
// 实际渲染由 FigureBlockView(NodeView)完成

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, type Editor } from '@tiptap/react'
import { FigureBlockView } from './FigureBlockView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figureBlock: {
      /// 插入图表块
      insertFigureBlock: (attrs: {
        figureId: string
        kind: 'figure' | 'table'
        label?: string | null
      }) => ReturnType
    }
  }
}

export const FigureBlock = Node.create({
  name: 'figureBlock',

  group: 'block',

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      figureId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-figure-id'),
        renderHTML: (attributes) => {
          if (!attributes.figureId) return {}
          return { 'data-figure-id': attributes.figureId }
        },
      },
      kind: {
        default: 'figure',
        parseHTML: (element) => element.getAttribute('data-kind') ?? 'figure',
        renderHTML: (attributes) => ({ 'data-kind': attributes.kind }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => {
          if (!attributes.label) return {}
          return { 'data-label': attributes.label }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-figure-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'figure-block' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureBlockView)
  },

  addCommands() {
    return {
      insertFigureBlock:
        (attrs) =>
        ({ commands }: { commands: any; editor: Editor }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },
})
