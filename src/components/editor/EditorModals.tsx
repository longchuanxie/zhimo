// 编辑器插入类弹框集中渲染容器
// 对应任务：C.11 EditorModals
//
// 职责：
// - 订阅 appStore.editorModal 全局状态
// - 根据 editorModal 值控制各插入弹框的 open 状态
// - 单一职责：仅做容器编排，不含业务逻辑
//
// 触发方：EditorToolbar 通过 setEditorModal('citation'|'figure'|...) 打开

import { useAppStore } from '@/stores/appStore'
import { CitationInsertModal } from './modals/CitationInsertModal'
import { FigureInsertModal } from './modals/FigureInsertModal'
import { EquationInsertModal } from './modals/EquationInsertModal'
import { CrossReferenceInsertModal } from './modals/CrossReferenceInsertModal'
import { FootnoteInsertModal } from './modals/FootnoteInsertModal'
import type { Editor } from '@tiptap/react'

type Props = {
  editor: Editor | null
  documentId: string
  projectId: string
}

export function EditorModals({ editor, documentId, projectId }: Props) {
  const editorModal = useAppStore((s) => s.editorModal)
  const setEditorModal = useAppStore((s) => s.setEditorModal)
  const close = () => setEditorModal(null)

  return (
    <>
      <CitationInsertModal
        editor={editor}
        documentId={documentId}
        projectId={projectId}
        open={editorModal === 'citation'}
        onClose={close}
      />
      <FigureInsertModal
        editor={editor}
        documentId={documentId}
        projectId={projectId}
        kind="figure"
        open={editorModal === 'figure'}
        onClose={close}
      />
      <FigureInsertModal
        editor={editor}
        documentId={documentId}
        projectId={projectId}
        kind="table"
        open={editorModal === 'table'}
        onClose={close}
      />
      <EquationInsertModal
        editor={editor}
        documentId={documentId}
        projectId={projectId}
        open={editorModal === 'equation'}
        onClose={close}
      />
      <CrossReferenceInsertModal
        editor={editor}
        documentId={documentId}
        projectId={projectId}
        open={editorModal === 'crossReference'}
        onClose={close}
      />
      <FootnoteInsertModal
        editor={editor}
        open={editorModal === 'footnote'}
        onClose={close}
      />
    </>
  )
}
