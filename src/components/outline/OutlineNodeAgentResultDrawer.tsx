// 大纲节点助手成果抽屉
// 用于在大纲树中查看单个节点绑定线程的已采纳助手成果。

import {
  DocumentTextIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { ObjectAgentResultPanel } from '@/components/agent/ObjectAgentResultPanel'
import { OUTLINE_NODE_STATUS_LABEL } from '@/constants/status'
import type { OutlineNode } from '@/types'

type OutlineNodeAgentResultDrawerProps = {
  projectId: string
  node: OutlineNode
  canDraft?: boolean
  isDrafting?: boolean
  onClose: () => void
  onDraftNode: (node: OutlineNode) => void
  onOpenDocument?: (documentId: string) => void
}

export function OutlineNodeAgentResultDrawer({
  projectId,
  node,
  canDraft = true,
  isDrafting = false,
  onClose,
  onDraftNode,
  onOpenDocument,
}: OutlineNodeAgentResultDrawerProps) {
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-card">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AppIcon icon={SparklesIcon} size="sm" className="text-purple" />
              <h2 className="truncate text-base font-bold text-ink">节点助手成果</h2>
            </div>
            <p className="mt-1 truncate text-sm text-muted">{node.title}</p>
          </div>
          <button
            type="button"
            className="btn-ghost px-1.5 py-1 text-muted"
            onClick={onClose}
            aria-label="关闭节点助手成果"
          >
            <AppIcon icon={XMarkIcon} size="sm" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-surface-2/40 p-3">
            <div className="text-xs font-semibold text-subtle">大纲节点</div>
            <div className="mt-1 text-sm font-semibold text-ink">{node.title}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span>当前字数：{node.currentWordCount}</span>
              {node.targetWordCount > 0 && <span>目标：{node.targetWordCount}</span>}
              <span>状态：{OUTLINE_NODE_STATUS_LABEL[node.status]}</span>
            </div>
          </div>

          {isDrafting && (
            <div className="rounded-md border border-brand/20 bg-brand-soft px-3 py-2">
              <p className="text-sm text-brand">
                已发送给助手起草正文。请在助手面板查看生成过程，采纳后的结果会沉淀在这里。
              </p>
            </div>
          )}

          <ObjectAgentResultPanel
            projectId={projectId}
            objectType="outline_node"
            objectId={node.id}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        {node.linkedDocumentId ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onOpenDocument?.(node.linkedDocumentId!)}
          >
            <AppIcon icon={DocumentTextIcon} size="sm" />
            打开文档
          </button>
        ) : (
          <span className="text-xs text-subtle">此节点尚未关联文档</span>
        )}
        {canDraft ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => onDraftNode(node)}
          >
            <AppIcon icon={SparklesIcon} size="sm" />
            让助手起草
          </button>
        ) : (
          <span className="text-xs text-subtle">仅正文层级可起草</span>
        )}
      </div>
    </aside>
  )
}
