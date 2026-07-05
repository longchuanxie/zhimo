// 公式块 Node 扩展
// 块级 atom node,通过 equationId 关联数据库 Equation 记录
// 实际渲染由 EquationBlockView(NodeView)完成,使用 KaTeX 渲染

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, type Editor } from '@tiptap/react'
import { EquationBlockView } from './EquationBlockView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equationBlock: {
      /// 插入公式块
      insertEquationBlock: (attrs: {
        equationId: string
        latex: string
        label?: string | null
      }) => ReturnType
    }
  }
}

export const EquationBlock = Node.create({
  name: 'equationBlock',

  group: 'block',

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      equationId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-equation-id'),
        renderHTML: (attributes) => {
          if (!attributes.equationId) return {}
          return { 'data-equation-id': attributes.equationId }
        },
      },
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({ 'data-latex': attributes.latex }),
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
      { tag: 'div[data-equation-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'equation-block' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EquationBlockView)
  },

  addCommands() {
    return {
      insertEquationBlock:
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
