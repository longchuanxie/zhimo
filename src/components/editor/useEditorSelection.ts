// 编辑器选区 Hook
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §6

import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

export type EditorSelection = {
  documentId: string
  from: number
  to: number
  selectedText: string
  surroundingTextBefore?: string
  surroundingTextAfter?: string
} | null

type UseEditorSelectionOptions = {
  editor: Editor | null
  documentId: string
}

export function useEditorSelection({
  editor,
  documentId,
}: UseEditorSelectionOptions) {
  const [selection, setSelection] = useState<EditorSelection>(null)

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection
      const selectedText = editor.state.doc.textBetween(from, to, '\n')

      if (selectedText.length > 0) {
        // 获取选区前后的文本（各 100 字符）
        const beforeFrom = Math.max(0, from - 100)
        const afterTo = Math.min(editor.state.doc.content.size, to + 100)
        const surroundingTextBefore = editor.state.doc.textBetween(beforeFrom, from, '\n')
        const surroundingTextAfter = editor.state.doc.textBetween(to, afterTo, '\n')

        setSelection({
          documentId,
          from,
          to,
          selectedText,
          surroundingTextBefore,
          surroundingTextAfter,
        })
      } else {
        setSelection(null)
      }
    }

    editor.on('selectionUpdate', handleSelectionUpdate)

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor, documentId])

  return selection
}
