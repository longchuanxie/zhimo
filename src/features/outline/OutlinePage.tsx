// 大纲页
// 对应路由：/projects/:projectId/outline
// 数据映射：OutlineService.getOutline + createOutlineNode + updateOutlineNodeService + moveOutlineNode + deleteOutlineNode + convertNodeToDocument

import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import {
  ListBulletIcon,
  PlusIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  DocumentTextIcon,
  PencilIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import { OutlineNodeAgentResultDrawer } from '@/components/outline/OutlineNodeAgentResultDrawer'
import { useAsync } from '@/hooks/useAsync'
import { useDialog } from '@/hooks/useDialog'
import { useObjectAgentCommand } from '@/hooks/useObjectAgentCommand'
import {
  getOutline,
  createOutlineNode,
  updateOutlineNodeService,
  moveOutlineNode,
  deleteOutlineNode,
  convertNodeToDocument,
} from '@/services/outline/OutlineService'
import { OUTLINE_NODE_STATUS_LABEL } from '@/constants/status'
import {
  APP_EVENTS,
  type OutlineChangedDetail,
} from '@/constants/events'
import type { OutlineNode, OutlineNodeStatus } from '@/types'
import type { OutlineWithNodes } from '@/services/outline/OutlineService'

const STATUS_OPTIONS: Array<{ value: OutlineNodeStatus; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'writing', label: '写作中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

export function OutlinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const { state, refresh } = useAsync<OutlineWithNodes>(
    () => getOutline(projectId!),
    [projectId],
    { enabled: !!projectId },
  )
  const { confirm } = useDialog()
  const { runObjectAgentCommand } = useObjectAgentCommand()

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [addingChildOf, setAddingChildOf] = useState<string | null | undefined>(undefined)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [selectedAgentNode, setSelectedAgentNode] = useState<OutlineNode | null>(null)
  const [draftingNodeId, setDraftingNodeId] = useState<string | null>(null)

  useEffect(() => {
    const handleOutlineChanged = (event: Event) => {
      const detail = (event as CustomEvent<OutlineChangedDetail>).detail
      if (!detail?.projectId || detail.projectId === projectId) {
        refresh()
      }
    }

    window.addEventListener(APP_EVENTS.outlineChanged, handleOutlineChanged)
    return () => {
      window.removeEventListener(APP_EVENTS.outlineChanged, handleOutlineChanged)
    }
  }, [projectId, refresh])

  // 构建树结构
  const tree = useMemo(() => {
    if (state.status !== 'success') return []
    return buildTree(state.data.nodes)
  }, [state])
  const draftableNodeIds = useMemo(() => new Set(collectDraftableNodeIds(tree)), [tree])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAddRoot = () => {
    setAddingChildOf(null)
    setNewNodeTitle('')
    setEditingId(null)
  }

  const handleAddChild = (parentId: string) => {
    setAddingChildOf(parentId)
    setNewNodeTitle('')
    setExpandedIds((prev) => new Set(prev).add(parentId))
    setEditingId(null)
  }

  const handleCreateNode = async (parentId: string | null) => {
    if (!projectId || !newNodeTitle.trim()) return

    const result = await createOutlineNode({
      projectId,
      parentId,
      title: newNodeTitle.trim(),
    })

    if (result.ok) {
      setAddingChildOf(undefined)
      setNewNodeTitle('')
      if (parentId) {
        setExpandedIds((prev) => new Set(prev).add(parentId))
      }
      refresh()
    } else {
      setMsg(`创建失败：${result.error.message}`)
    }
  }

  const handleStartEdit = (node: OutlineNode) => {
    setEditingId(node.id)
    setEditTitle(node.title)
    setAddingChildOf(undefined)
  }

  const handleSaveEdit = async (nodeId: string) => {
    if (!editTitle.trim()) {
      setEditingId(null)
      return
    }

    const result = await updateOutlineNodeService({
      nodeId,
      patch: { title: editTitle.trim() },
    })

    if (result.ok) {
      setEditingId(null)
      refresh()
    } else {
      setMsg(`保存失败：${result.error.message}`)
    }
  }

  const handleMove = async (nodeId: string, direction: 'up' | 'down') => {
    const result = await moveOutlineNode(nodeId, direction)
    if (result.ok) {
      refresh()
    } else {
      setMsg(`移动失败：${result.error.message}`)
    }
  }

  const handleDelete = async (node: OutlineNode) => {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除节点「${node.title}」吗？`,
      danger: true,
    })
    if (!confirmed) return

    const result = await deleteOutlineNode(node.id)
    if (result.ok) {
      if (selectedAgentNode?.id === node.id) {
        setSelectedAgentNode(null)
      }
      refresh()
    } else {
      setMsg(`删除失败：${result.error.message}`)
    }
  }

  const handleStatusChange = async (nodeId: string, status: OutlineNodeStatus) => {
    const result = await updateOutlineNodeService({ nodeId, patch: { status } })
    if (result.ok) {
      refresh()
    } else {
      setMsg(`状态更新失败：${result.error.message}`)
    }
  }

  const handleConvertToDoc = async (node: OutlineNode) => {
    const result = await convertNodeToDocument(node.id)
    if (result.ok) {
      setMsg('已创建关联文档')
      setTimeout(() => setMsg(null), 2000)
      refresh()
      if (result.data.linkedDocumentId) {
        navigate(`/projects/${projectId}/documents/${result.data.linkedDocumentId}`)
      }
    } else {
      console.error('convertNodeToDocument failed:', result.error)
      const detail = result.error.detail ? ` (${result.error.detail})` : ''
      setMsg(`转换失败：${result.error.message}${detail}`)
    }
  }

  const handleDraftNode = (node: OutlineNode) => {
    if (!projectId) return
    if (!draftableNodeIds.has(node.id)) {
      setMsg('只有包含写作目标的正文层级才能让助手起草正文')
      setTimeout(() => setMsg(null), 2000)
      return
    }

    const ok = runObjectAgentCommand({
      projectId,
      command: 'draft_outline_node',
      objectType: 'outline_node',
      objectId: node.id,
      objectTitle: node.title,
    })
    if (ok) {
      setSelectedAgentNode(node)
      setDraftingNodeId(node.id)
      setMsg(`已发送给助手：围绕「${node.title}」起草正文`)
      setTimeout(() => setMsg(null), 2000)
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="正在加载大纲..." />
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={refresh} title="大纲加载失败" />
  }

  const { outline } = state.data

  return (
    <div className="h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold text-ink">{outline.title}</h1>
          <p className="text-sm text-muted mt-1">
            共 {state.data.nodes.length} 个节点。组织你的写作结构，每个节点可关联一篇文档。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={refresh}
            aria-label="刷新"
          >
            <AppIcon icon={ArrowPathIcon} size="sm" />
            刷新
          </button>
          <button type="button" className="btn-primary" onClick={handleAddRoot}>
            <AppIcon icon={PlusIcon} size="sm" />
            添加节点
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div className="mx-8 mt-3 rounded-md bg-brand-soft border border-brand/20 px-4 py-2">
          <p className="text-sm text-brand">{msg}</p>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {tree.length === 0 && addingChildOf === undefined ? (
          <EmptyState
            icon={ListBulletIcon}
            title="大纲还是空的"
            description="添加大纲节点来组织你的写作结构。每个节点可以关联一篇文档，支持多级嵌套。"
            primaryAction={{
              label: '添加根节点',
              icon: PlusIcon,
              onClick: handleAddRoot,
            }}
            hint="大纲节点支持：草稿 → 写作中 → 已完成 状态流转"
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-1">
            {/* 根节点添加表单 */}
            {addingChildOf === null && (
              <AddNodeForm
                title={newNodeTitle}
                onChange={setNewNodeTitle}
                onSubmit={() => handleCreateNode(null)}
                onCancel={() => setAddingChildOf(undefined)}
                placeholder="输入根节点标题..."
              />
            )}

            {/* 树形节点列表 */}
            {tree.map((node) => (
              <OutlineNodeItem
                key={node.id}
                node={node}
                children={node.children}
                expandedIds={expandedIds}
                editingId={editingId}
                editTitle={editTitle}
                addingChildOf={addingChildOf}
                newNodeTitle={newNodeTitle}
                depth={0}
                onToggleExpand={toggleExpand}
                onAddChild={handleAddChild}
                onStartEdit={handleStartEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingId(null)}
                onEditTitleChange={setEditTitle}
                onMove={handleMove}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                onConvertToDoc={handleConvertToDoc}
                onDraftNode={handleDraftNode}
                onShowAgentResults={setSelectedAgentNode}
                onCreateChild={handleCreateNode}
                onCancelAddChild={() => setAddingChildOf(undefined)}
                onNewNodeTitleChange={setNewNodeTitle}
                onOpenDoc={(docId) => navigate(`/projects/${projectId}/documents/${docId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {projectId && selectedAgentNode && (
        <OutlineNodeAgentResultDrawer
          projectId={projectId}
          node={selectedAgentNode}
          canDraft={draftableNodeIds.has(selectedAgentNode.id)}
          isDrafting={draftingNodeId === selectedAgentNode.id}
          onClose={() => setSelectedAgentNode(null)}
          onDraftNode={handleDraftNode}
          onOpenDocument={(docId) => navigate(`/projects/${projectId}/documents/${docId}`)}
        />
      )}
    </div>
  )
}

// ============ 树结构工具 ============

type OutlineTreeNode = OutlineNode & { children: OutlineTreeNode[] }

function buildTree(nodes: OutlineNode[]): OutlineTreeNode[] {
  const nodeMap = new Map<string, OutlineTreeNode>()
  const roots: OutlineTreeNode[] = []

  // 创建所有节点的映射
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] })
  }

  // 构建父子关系
  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id)!
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(treeNode)
    } else {
      roots.push(treeNode)
    }
  }

  return roots
}

function collectDraftableNodeIds(nodes: OutlineTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(canDraftOutlineNodeBody(node.children) ? [node.id] : []),
    ...collectDraftableNodeIds(node.children),
  ])
}

// ============ 子组件：大纲节点项 ============

type OutlineNodeItemProps = {
  node: OutlineNode
  children: OutlineTreeNode[]
  expandedIds: Set<string>
  editingId: string | null
  editTitle: string
  addingChildOf: string | null | undefined
  newNodeTitle: string
  depth: number
  onToggleExpand: (id: string) => void
  onAddChild: (parentId: string) => void
  onStartEdit: (node: OutlineNode) => void
  onSaveEdit: (nodeId: string) => void
  onCancelEdit: () => void
  onEditTitleChange: (title: string) => void
  onMove: (nodeId: string, direction: 'up' | 'down') => void
  onDelete: (node: OutlineNode) => void
  onStatusChange: (nodeId: string, status: OutlineNodeStatus) => void
  onConvertToDoc: (node: OutlineNode) => void
  onDraftNode: (node: OutlineNode) => void
  onShowAgentResults: (node: OutlineNode) => void
  onCreateChild: (parentId: string) => void
  onCancelAddChild: () => void
  onNewNodeTitleChange: (title: string) => void
  onOpenDoc: (docId: string) => void
}

function OutlineNodeItem({
  node,
  children,
  expandedIds,
  editingId,
  editTitle,
  addingChildOf,
  newNodeTitle,
  depth,
  onToggleExpand,
  onAddChild,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTitleChange,
  onMove,
  onDelete,
  onStatusChange,
  onConvertToDoc,
  onDraftNode,
  onShowAgentResults,
  onCreateChild,
  onCancelAddChild,
  onNewNodeTitleChange,
  onOpenDoc,
}: OutlineNodeItemProps) {
  const isExpanded = expandedIds.has(node.id)
  const isEditing = editingId === node.id
  const hasChildren = children.length > 0
  const canDraftBody = canDraftOutlineNodeBody(children)

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-surface-2/50 group"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* 展开/折叠按钮 */}
        <button
          type="button"
          className="flex-shrink-0 p-0.5 text-subtle hover:text-ink"
          onClick={() => hasChildren && onToggleExpand(node.id)}
        >
          {hasChildren ? (
            <AppIcon icon={isExpanded ? ChevronDownIcon : ChevronRightIcon} size="sm" />
          ) : (
            <span className="inline-block w-4" />
          )}
        </button>

        {/* 标题或编辑框 */}
        {isEditing ? (
          <input
            type="text"
            className="input flex-1 py-1"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={() => onSaveEdit(node.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit(node.id)
              else if (e.key === 'Escape') onCancelEdit()
            }}
            autoFocus
            maxLength={200}
          />
        ) : (
          <button
            type="button"
            className="flex-1 text-left text-sm font-medium text-ink hover:text-brand transition-colors truncate"
            onClick={() => onStartEdit(node)}
            title="点击编辑标题"
          >
            {node.title}
          </button>
        )}

        {/* 状态标签（可点击修改） */}
        {!isEditing && (
          <div className="relative">
            <StatusTag
              status={node.status}
              label={OUTLINE_NODE_STATUS_LABEL[node.status]}
            />
            <select
              aria-label="更改状态"
              className="absolute inset-0 opacity-0 cursor-pointer"
              value={node.status}
              onChange={(e) =>
                onStatusChange(node.id, e.target.value as OutlineNodeStatus)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 字数 */}
        {!isEditing && (node.targetWordCount > 0 || node.currentWordCount > 0) && (
          <span className="text-xs text-subtle flex-shrink-0">
            {node.currentWordCount}
            {node.targetWordCount > 0 && `/${node.targetWordCount}`} 字
          </span>
        )}

        {/* 关联文档链接 */}
        {!isEditing && node.linkedDocumentId && (
          <button
            type="button"
            className="btn-ghost px-1.5 py-1"
            onClick={() => onOpenDoc(node.linkedDocumentId!)}
            title="打开关联文档"
          >
            <AppIcon icon={DocumentTextIcon} size="sm" className="text-brand" />
          </button>
        )}

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="btn-ghost px-1.5 py-1"
              onClick={() => onMove(node.id, 'up')}
              title="上移"
            >
              <AppIcon icon={ArrowUpIcon} size="sm" />
            </button>
            <button
              type="button"
              className="btn-ghost px-1.5 py-1"
              onClick={() => onMove(node.id, 'down')}
              title="下移"
            >
              <AppIcon icon={ArrowDownIcon} size="sm" />
            </button>
            <button
              type="button"
              className="btn-ghost px-1.5 py-1"
              onClick={() => onAddChild(node.id)}
              title="添加子节点"
            >
              <AppIcon icon={PlusIcon} size="sm" />
            </button>
            {!node.linkedDocumentId && canDraftBody && (
              <button
                type="button"
                className="btn-ghost px-1.5 py-1"
                onClick={() => onConvertToDoc(node)}
                title="转为文档"
              >
                <AppIcon icon={DocumentTextIcon} size="sm" />
              </button>
            )}
            {canDraftBody && (
              <button
                type="button"
                className="btn-ghost px-1.5 py-1"
                onClick={() => onDraftNode(node)}
                title="让助手起草正文"
              >
                <AppIcon icon={SparklesIcon} size="sm" />
              </button>
            )}
            <button
              type="button"
              className="btn-ghost px-1.5 py-1"
              onClick={() => onShowAgentResults(node)}
              title="查看助手成果"
            >
              <AppIcon icon={ChatBubbleLeftRightIcon} size="sm" />
            </button>
            <button
              type="button"
              className="btn-ghost px-1.5 py-1"
              onClick={() => onStartEdit(node)}
              title="编辑"
            >
              <AppIcon icon={PencilIcon} size="sm" />
            </button>
            <button
              type="button"
              className="btn-ghost px-1.5 py-1 text-danger hover:bg-danger-soft"
              onClick={() => onDelete(node)}
              title="删除"
            >
              <AppIcon icon={TrashIcon} size="sm" />
            </button>
          </div>
        )}
      </div>

      {/* 添加子节点表单 */}
      {addingChildOf === node.id && (
        <div style={{ paddingLeft: `${(depth + 1) * 24 + 12}px` }}>
          <AddNodeForm
            title={newNodeTitle}
            onChange={onNewNodeTitleChange}
            onSubmit={() => onCreateChild(node.id)}
            onCancel={onCancelAddChild}
            placeholder="输入子节点标题..."
          />
        </div>
      )}

      {/* 子节点 */}
      {isExpanded && hasChildren && (
        <div>
          {children.map((child) => (
            <OutlineNodeItem
              key={child.id}
              node={child}
              children={child.children}
              expandedIds={expandedIds}
              editingId={editingId}
              editTitle={editTitle}
              addingChildOf={addingChildOf}
              newNodeTitle={newNodeTitle}
              depth={depth + 1}
              onToggleExpand={onToggleExpand}
              onAddChild={onAddChild}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onEditTitleChange={onEditTitleChange}
              onMove={onMove}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onConvertToDoc={onConvertToDoc}
              onDraftNode={onDraftNode}
              onShowAgentResults={onShowAgentResults}
              onCreateChild={onCreateChild}
              onCancelAddChild={onCancelAddChild}
              onNewNodeTitleChange={onNewNodeTitleChange}
              onOpenDoc={onOpenDoc}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 子组件：添加节点表单 ============

export function canDraftOutlineNodeBody(children: Array<{ children: unknown[] }>): boolean {
  return children.length > 0 && children.every((child) => child.children.length === 0)
}

type AddNodeFormProps = {
  title: string
  onChange: (title: string) => void
  onSubmit: () => void
  onCancel: () => void
  placeholder: string
}

function AddNodeForm({ title, onChange, onSubmit, onCancel, placeholder }: AddNodeFormProps) {
  return (
    <div className="flex items-center gap-2 py-2 px-3">
      <input
        type="text"
        className="input flex-1 py-1"
        placeholder={placeholder}
        value={title}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
          else if (e.key === 'Escape') onCancel()
        }}
        autoFocus
        maxLength={200}
      />
      <button type="button" className="btn-primary py-1 px-3" onClick={onSubmit}>
        添加
      </button>
      <button type="button" className="btn-secondary py-1 px-3" onClick={onCancel}>
        取消
      </button>
    </div>
  )
}
