// 引文 Mark 扩展
// 行内引文标记,包裹引文文本,存储 citationId/referenceId
// 用于论文写作中的引用标注

import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      /// 设置引文 mark
      setCitation: (attrs: { citationId: string; referenceId: string }) => ReturnType
      /// 取消引文 mark
      unsetCitation: () => ReturnType
    }
  }
}

export const CitationMark = Mark.create({
  name: 'citation',

  inclusive: false,

  addAttributes() {
    return {
      citationId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-citation-id'),
        renderHTML: (attributes) => {
          if (!attributes.citationId) return {}
          return { 'data-citation-id': attributes.citationId }
        },
      },
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-reference-id'),
        renderHTML: (attributes) => {
          if (!attributes.referenceId) return {}
          return { 'data-reference-id': attributes.referenceId }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-citation-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'citation-mark' }), 0]
  },

  addCommands() {
    return {
      setCitation:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
      unsetCitation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
