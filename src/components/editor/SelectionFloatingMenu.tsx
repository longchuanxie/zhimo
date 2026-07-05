// 选区浮动菜单
// 对应文档：06_工程实施补齐/05_编辑器技术方案_TipTap_ProseMirror_v1.0.md §7
// 动作：改写、扩写、缩写、检查来源、保存为卡片、保存为知识

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import type { Editor } from '@tiptap/react'
import { AppIcon } from '@/components/foundation/AppIcon'
import {
  PencilSquareIcon,
  ArrowsRightLeftIcon,
  ScissorsIcon,
  MagnifyingGlassCircleIcon,
  Squares2X2Icon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'
import { useAppStore } from '@/stores/appStore'
import {
  executeSelectionAgentCommand,
  type SelectionAgentCommand,
} from '@/services/agent/AgentCommandService'

type SelectionFloatingMenuProps = {
  editor: Editor | null
}

type ActionItem = {
  key: SelectionAgentCommand
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  onClick: () => void
}

export function SelectionFloatingMenu({ editor }: SelectionFloatingMenuProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [commandError, setCommandError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setSelectedText = useAppStore((s) => s.setSelectedText)
  const setAgentPanelOpen = useAppStore((s) => s.setAgentPanelOpen)
  const setPendingAgentAction = useAppStore((s) => s.setPendingAgentAction)

  /// 获取当前选区文本
  const getSelectedText = useCallback(() => {
    if (!editor) return ''
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, '\n')
  }, [editor])

  /// 执行选区命令：AI 类命令打开助手面板，本地写入类命令由 Service 落地。
  const runSelectionCommand = useCallback(
    async (command: SelectionAgentCommand) => {
      if (!projectId) return
      const text = getSelectedText()
      if (!text) return

      setCommandError(null)
      const result = await executeSelectionAgentCommand({
        projectId,
        command,
        selectedText: text,
      })

      if (!result.ok) {
        setCommandError(result.error.message)
        return
      }

      if (result.data.kind === 'pending_agent_action') {
        setSelectedText(result.data.selectedText)
        setAgentPanelOpen(true)
        setPendingAgentAction(result.data.action)
      }

      setVisible(false)
    },
    [
      projectId,
      getSelectedText,
      setSelectedText,
      setAgentPanelOpen,
      setPendingAgentAction,
    ],
  )

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection
      const selectedText = editor.state.doc.textBetween(from, to, '\n')

      if (selectedText.length === 0) {
        setVisible(false)
        setCommandError(null)
        return
      }

      // 获取选区的屏幕坐标
      const coords = editor.view.coordsAtPos(from)
      const editorRect = editor.view.dom.getBoundingClientRect()

      setPosition({
        top: coords.top - editorRect.top - 48,
        left: coords.left - editorRect.left,
      })
      setVisible(true)
    }

    editor.on('selectionUpdate', handleSelectionUpdate)

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor])

  if (!editor || !visible) return null

  const actions: ActionItem[] = [
    {
      key: 'rewrite',
      label: '改写',
      icon: PencilSquareIcon,
      onClick: () => void runSelectionCommand('rewrite'),
    },
    {
      key: 'expand',
      label: '扩写',
      icon: ArrowsRightLeftIcon,
      onClick: () => void runSelectionCommand('expand'),
    },
    {
      key: 'summarize',
      label: '缩写',
      icon: ScissorsIcon,
      onClick: () => void runSelectionCommand('summarize'),
    },
    {
      key: 'check_source',
      label: '检查来源',
      icon: MagnifyingGlassCircleIcon,
      onClick: () => void runSelectionCommand('check_source'),
    },
    {
      key: 'save_as_card',
      label: '保存为卡片',
      icon: Squares2X2Icon,
      onClick: () => void runSelectionCommand('save_as_card'),
    },
    {
      key: 'save_as_knowledge',
      label: '保存为知识',
      icon: CircleStackIcon,
      onClick: () => void runSelectionCommand('save_as_knowledge'),
    },
  ]

  return (
    <div
      ref={menuRef}
      className="absolute z-50 rounded-md border border-line bg-surface shadow-card"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-muted hover:bg-brand-soft hover:text-brand transition-colors"
            onClick={action.onClick}
          >
            <AppIcon icon={action.icon} size="xs" />
            {action.label}
          </button>
        ))}
      </div>
      {commandError && (
        <p className="border-t border-line px-3 py-1.5 text-xs text-danger">
          {commandError}
        </p>
      )}
    </div>
  )
}
