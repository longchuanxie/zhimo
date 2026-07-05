// TipTap 富文本编辑器
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md
// MVP Schema: doc/paragraph/heading/blockquote/bulletList/orderedList/listItem/horizontalRule
// Marks: bold/italic/code/link

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Mathematics from '@tiptap/extension-mathematics'
import { useEffect, useMemo } from 'react'
import { EditorToolbar } from './EditorToolbar'
import { AutosaveIndicator } from './AutosaveIndicator'
import { SelectionFloatingMenu } from './SelectionFloatingMenu'
import { AgentInlineCandidatePanel } from './AgentInlineCandidatePanel'
import { useEditorAutosave } from './useEditorAutosave'
import { useAgentInlineCandidateActions } from '@/hooks/useAgentInlineCandidateActions'
import { editorToPlainText } from './editorToPlainText'
import { countWords } from './editorWordCount'
import { useAppStore } from '@/stores/appStore'
import { CitationMark } from './extensions/CitationMark'
import { FigureBlock } from './extensions/FigureBlock'
import { EquationBlock } from './extensions/EquationBlock'
import { CrossReference } from './extensions/CrossReference'
import { Footnote } from './extensions/Footnote'
import { EditorModals } from './EditorModals'

type EditorProps = {
  documentId: string
  projectId: string
  /// 初始内容（TipTap JSON）
  initialContent: unknown | null
  contentVersion?: number
  /// 内容变化回调
  onContentChange?: (wordCount: number) => void
}

export function Editor({
  documentId,
  projectId,
  initialContent,
  contentVersion = 0,
  onContentChange,
}: EditorProps) {
  const setSelectedText = useAppStore((s) => s.setSelectedText)
  const agentInlineCandidate = useAppStore((s) => s.agentInlineCandidate)
  const activeCandidate =
    agentInlineCandidate?.documentId === documentId ? agentInlineCandidate : null
  const {
    processing: candidateProcessing,
    errorMessage: candidateErrorMessage,
    applyCandidate,
    rejectCandidate,
    dismissCandidate,
  } = useAgentInlineCandidateActions(activeCandidate)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // MVP 包含：heading, bold, italic, code, blockquote, bulletList, orderedList, listItem, horizontalRule
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: '从这里开始写作...',
      }),
      // 论文写作扩展:图片/表格/行内公式
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Mathematics,
      // 论文写作自定义扩展:引文/图表块/公式块/交叉引用/脚注
      CitationMark,
      FigureBlock,
      EquationBlock,
      CrossReference,
      Footnote,
    ],
    content: initialContent ?? undefined,
    editorProps: {
      attributes: {
        class: 'prose-editor',
      },
    },
  })

  // 自动保存
  const { status: autosaveStatus } = useEditorAutosave({
    editor,
    documentId,
    projectId,
  })

  // 字数统计
  useEffect(() => {
    if (!editor || contentVersion === 0) return
    editor.commands.setContent(normalizeEditorContent(initialContent), {
      emitUpdate: false,
    })
  }, [editor, initialContent, contentVersion])

  const wordCount = useMemo(() => {
    if (!editor) return 0
    const content = editor.getJSON()
    const plainText = editorToPlainText(content)
    return countWords(plainText)
  }, [editor, editor?.getJSON()])

  // 内容变化时通知父组件
  useEffect(() => {
    if (!editor || !onContentChange) return
    const handleUpdate = () => {
      const content = editor.getJSON()
      const plainText = editorToPlainText(content)
      onContentChange(countWords(plainText))
    }
    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, onContentChange])

  // 选区变化时上报到全局状态（供 Agent 面板快捷动作使用）
  useEffect(() => {
    if (!editor) return
    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection
      if (empty) {
        setSelectedText('')
      } else {
        const text = editor.state.doc.textBetween(from, to, ' ')
        setSelectedText(text)
      }
    }
    editor.on('selectionUpdate', handleSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
      // 组件卸载时清空选区
      setSelectedText('')
    }
  }, [editor, setSelectedText])

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <EditorToolbar editor={editor} />

      {/* 编辑区 */}
      <div className="flex-1 overflow-auto relative">
        {/* 选区浮动菜单 */}
        <SelectionFloatingMenu editor={editor} />

        {/* Agent 采纳候选 */}
        {activeCandidate && (
          <AgentInlineCandidatePanel
            candidate={activeCandidate}
            processing={candidateProcessing}
            errorMessage={candidateErrorMessage}
            onApply={() => void applyCandidate()}
            onReject={() => void rejectCandidate()}
            onDismiss={dismissCandidate}
          />
        )}

        {/* 编辑器内容 */}
        <div className="max-w-[800px] mx-auto px-12 py-10">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between border-t border-line bg-surface/60">
        <AutosaveIndicator status={autosaveStatus} wordCount={wordCount} />
      </div>

      {/* 论文写作插入弹框（引文/图表/公式/交叉引用/脚注） */}
      <EditorModals editor={editor} documentId={documentId} projectId={projectId} />
    </div>
  )
}

function normalizeEditorContent(content: unknown): string | JSONContent {
  if (typeof content === 'string') return content
  if (isJsonContent(content)) return content
  return ''
}

function isJsonContent(content: unknown): content is JSONContent {
  return typeof content === 'object' && content !== null
}
