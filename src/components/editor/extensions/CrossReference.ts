// 交叉引用 Mark 扩展
// 标记交叉引用位置,存储 targetId/targetType,显示文本由 UI 层解析

import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossReference: {
      /// 设置交叉引用 mark
      setCrossReference: (attrs: {
        targetId: string
        targetType: 'figure' | 'table' | 'equation' | 'section'
        label?: string | null
      }) => ReturnType
      /// 取消交叉引用 mark
      unsetCrossReference: () => ReturnType
    }
  }
}

export const CrossReference = Mark.create({
  name: 'crossReference',

  inclusive: false,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-target-id'),
        renderHTML: (attributes) => {
          if (!attributes.targetId) return {}
          return { 'data-target-id': attributes.targetId }
        },
      },
      targetType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-target-type'),
        renderHTML: (attributes) => {
          if (!attributes.targetType) return {}
          return { 'data-target-type': attributes.targetType }
        },
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
      { tag: 'span[data-target-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'cross-reference-mark' }), 0]
  },

  addCommands() {
    return {
      setCrossReference:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
      unsetCrossReference:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
