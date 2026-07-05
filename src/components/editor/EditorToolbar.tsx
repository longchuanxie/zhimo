// 编辑器工具栏
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §4

import type { Editor } from '@tiptap/react'
import { AppIcon } from '@/components/foundation/AppIcon'
import { useDialog } from '@/hooks/useDialog'
import { useAppStore } from '@/stores/appStore'
import {
  BoldIcon,
  ItalicIcon,
  CodeBracketIcon,
  LinkIcon,
  ListBulletIcon,
  NumberedListIcon,
  ChatBubbleLeftIcon,
  Bars3BottomLeftIcon,
  MinusIcon,
  ChatBubbleLeftRightIcon,
  PhotoIcon,
  TableCellsIcon,
  CommandLineIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

type EditorToolbarProps = {
  editor: Editor | null
}

type ToolbarButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  isActive: boolean
  onClick: () => void
}

function ToolbarButton({ icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`p-2 rounded-md transition-colors ${
        isActive
          ? 'bg-brand-soft text-brand'
          : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <AppIcon icon={icon} size="sm" />
    </button>
  )
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const { prompt } = useDialog()
  const setEditorModal = useAppStore((s) => s.setEditorModal)
  if (!editor) return null

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-line bg-surface/60 overflow-x-auto">
      {/* 标题 */}
      <ToolbarButton
        icon={Bars3BottomLeftIcon}
        label="标题"
        isActive={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />

      {/* 加粗 */}
      <ToolbarButton
        icon={BoldIcon}
        label="加粗"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />

      {/* 斜体 */}
      <ToolbarButton
        icon={ItalicIcon}
        label="斜体"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />

      {/* 行内代码 */}
      <ToolbarButton
        icon={CodeBracketIcon}
        label="代码"
        isActive={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      {/* 链接 */}
      <ToolbarButton
        icon={LinkIcon}
        label="链接"
        isActive={editor.isActive('link')}
        onClick={async () => {
          const url = await prompt({ title: '输入链接地址' })
          if (url) {
            editor.chain().focus().setLink({ href: url }).run()
          }
        }}
      />

      <div className="w-px h-5 bg-line mx-1" />

      {/* 无序列表 */}
      <ToolbarButton
        icon={ListBulletIcon}
        label="无序列表"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />

      {/* 有序列表 */}
      <ToolbarButton
        icon={NumberedListIcon}
        label="有序列表"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      {/* 引用 */}
      <ToolbarButton
        icon={ChatBubbleLeftIcon}
        label="引用"
        isActive={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      {/* 分割线 */}
      <ToolbarButton
        icon={MinusIcon}
        label="分割线"
        isActive={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <div className="w-px h-5 bg-line mx-1" />

      {/* 论文写作按钮组 */}
      <ToolbarButton
        icon={ChatBubbleLeftRightIcon}
        label="插入引文"
        isActive={editor.isActive('citation')}
        onClick={() => setEditorModal('citation')}
      />

      <ToolbarButton
        icon={PhotoIcon}
        label="插入图表"
        isActive={false}
        onClick={() => setEditorModal('figure')}
      />

      <ToolbarButton
        icon={TableCellsIcon}
        label="插入表格"
        isActive={false}
        onClick={() => setEditorModal('table')}
      />

      <ToolbarButton
        icon={CommandLineIcon}
        label="插入公式"
        isActive={false}
        onClick={() => setEditorModal('equation')}
      />

      <ToolbarButton
        icon={ArrowTopRightOnSquareIcon}
        label="交叉引用"
        isActive={editor.isActive('crossReference')}
        onClick={() => setEditorModal('crossReference')}
      />

      <ToolbarButton
        icon={NumberedListIcon}
        label="插入脚注"
        isActive={editor.isActive('footnote')}
        onClick={() => setEditorModal('footnote')}
      />
    </div>
  )
}
