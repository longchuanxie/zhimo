// 脚注 Mark 扩展(自研轻量版)
// 上标数字标记,脚注内容存 attrs.content,导出时生成文末脚注列表
// 注:MVP 不实现独立脚注编辑器 UI,内容通过命令 attrs 传入

import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /// 设置脚注 mark
      setFootnote: (attrs: { footnoteId: string; content: string }) => ReturnType
      /// 取消脚注 mark
      unsetFootnote: () => ReturnType
    }
  }
}

export const Footnote = Mark.create({
  name: 'footnote',

  inclusive: false,

  addAttributes() {
    return {
      footnoteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-footnote-id'),
        renderHTML: (attributes) => {
          if (!attributes.footnoteId) return {}
          return { 'data-footnote-id': attributes.footnoteId }
        },
      },
      content: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-content') ?? '',
        renderHTML: (attributes) => {
          if (!attributes.content) return {}
          return { 'data-content': attributes.content }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-footnote-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'footnote-mark' }), 0]
  },

  addCommands() {
    return {
      setFootnote:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
      unsetFootnote:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
