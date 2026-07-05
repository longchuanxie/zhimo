// 编辑器自动保存 Hook
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §5
// 触发条件：内容变化 debounce 1000ms、窗口失焦、切换文档

import { useEffect, useRef, useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { autosaveDocument } from '@/services/document/DocumentService'
import { editorToPlainText } from './editorToPlainText'
import { countWords } from './editorWordCount'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

type UseEditorAutosaveOptions = {
  editor: Editor | null
  documentId: string
  projectId: string
  /// debounce 延迟，默认 1000ms
  debounceMs?: number
  /// 是否启用
  enabled?: boolean
}

export function useEditorAutosave({
  editor,
  documentId,
  projectId,
  debounceMs = 1000,
  enabled = true,
}: UseEditorAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)

  const save = useCallback(async () => {
    if (!editor || isSavingRef.current) return

    isSavingRef.current = true
    setStatus('saving')

    try {
      const contentJson = editor.getJSON()
      const plainText = editorToPlainText(contentJson)
      const wordCount = countWords(plainText)

      const result = await autosaveDocument({
        projectId,
        documentId,
        contentJson,
        plainText,
        wordCount,
      })

      if (result.ok) {
        setStatus('saved')
        // 2 秒后恢复 idle
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('failed')
      }
    } catch {
      setStatus('failed')
    } finally {
      isSavingRef.current = false
    }
  }, [editor, documentId, projectId])

  useEffect(() => {
    if (!editor || !enabled) return

    const handleUpdate = () => {
      // 清除之前的定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      // 设置新的 debounce 定时器
      timerRef.current = setTimeout(() => {
        save()
      }, debounceMs)
    }

    editor.on('update', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [editor, enabled, debounceMs, save])

  // 窗口失焦时保存
  useEffect(() => {
    if (!enabled) return

    const handleBlur = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      save()
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [save, enabled])

  // 组件卸载时保存
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      // 同步保存（不等待）
      if (editor && !editor.isDestroyed) {
        const contentJson = editor.getJSON()
        const plainText = editorToPlainText(contentJson)
        const wordCount = countWords(plainText)
        autosaveDocument({
          projectId,
          documentId,
          contentJson,
          plainText,
          wordCount,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, save }
}
