// 文档编辑页
// 对应路由：/projects/:projectId/documents/:documentId
// 数据映射：DocumentService.getDocument + DocumentService.updateDocumentTitleService
// 集成：Editor 组件（含自动保存、字数统计、选区浮动菜单）

import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { Editor } from '@/components/editor/Editor'
import { PaperIntegrityPanel } from '@/components/editor/PaperIntegrityPanel'
import { SpellCheckPanel } from '@/components/editor/SpellCheckPanel'
import {
  getDocument,
  updateDocumentTitleService,
} from '@/services/document/DocumentService'
import { extractFromDocument } from '@/services/knowledge/KnowledgeExtractor'
import { createKnowledge } from '@/services/knowledge/KnowledgeService'
import { getProject } from '@/services/project/ProjectService'
import { useAsync } from '@/hooks/useAsync'
import { useAppStore } from '@/stores/appStore'
import { toast } from '@/stores/toastStore'
import {
  APP_EVENTS,
  type DocumentContentChangedDetail,
} from '@/constants/events'
import type { Document } from '@/types'

/// 从 TipTap contentJson 中递归提取纯文本
function extractTextFromContentJson(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as { text?: string; content?: unknown[] }
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return n.content.map((c) => extractTextFromContentJson(c)).join('')
  }
  return ''
}

export function DocumentEditorPage() {
  const { projectId, documentId } = useParams<{
    projectId: string
    documentId: string
  }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const [title, setTitle] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleSaving, setTitleSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [editorContentVersion, setEditorContentVersion] = useState(0)
  const setActiveDocumentId = useAppStore((s) => s.setActiveDocumentId)

  // 加载项目信息，用于按项目类型切换检查面板（小说→拼写检查，其他→论文完整性）
  const docProjectId = doc?.projectId
  const { state: projectState } = useAsync(
    () => getProject(docProjectId!),
    [docProjectId],
    { enabled: !!docProjectId },
  )
  const projectType = projectState.status === 'success' ? projectState.data.type : null

  // 文档加载完成后设置活动文档 ID，供 Agent 采纳时判断是否有文档可插入
  useEffect(() => {
    if (!doc) return
    setActiveDocumentId(doc.id)
    return () => setActiveDocumentId(null)
  }, [doc, setActiveDocumentId])

  useEffect(() => {
    if (!documentId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await getDocument(documentId!)
      if (cancelled) return

      if (result.ok) {
        setDoc(result.data)
        setTitle(result.data.title)
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const reloadDocumentContent = useCallback(async () => {
    if (!documentId) return
    const result = await getDocument(documentId)
    if (result.ok) {
      setDoc(result.data)
      setTitle(result.data.title)
      setEditorContentVersion((version) => version + 1)
    } else {
      toast.error(`文档刷新失败：${result.error.message}`)
    }
  }, [documentId])

  useEffect(() => {
    if (!documentId) return

    const handleDocumentChanged = (event: Event) => {
      const detail = (event as CustomEvent<DocumentContentChangedDetail>).detail
      if (detail?.documentId === documentId) {
        void reloadDocumentContent()
      }
    }

    window.addEventListener(APP_EVENTS.documentContentChanged, handleDocumentChanged)
    return () => {
      window.removeEventListener(APP_EVENTS.documentContentChanged, handleDocumentChanged)
    }
  }, [documentId, reloadDocumentContent])

  const handleTitleSave = async () => {
    if (!documentId || !doc) return
    if (!title.trim() || title.trim() === doc.title) {
      setTitle(doc.title)
      setTitleEditing(false)
      return
    }

    setTitleSaving(true)
    const result = await updateDocumentTitleService(documentId, title.trim())
    setTitleSaving(false)

    if (result.ok) {
      setDoc(result.data)
      setTitleEditing(false)
    } else {
      toast.error(`标题保存失败：${result.error.message}`)
      setTitle(doc.title)
    }
  }

  const handleExtractKnowledge = async () => {
    if (!doc || !projectId) return
    const content = extractTextFromContentJson(doc.contentJson)
    if (!content.trim()) {
      toast.info('文档内容为空，无法提取知识')
      return
    }

    setExtracting(true)
    const result = await extractFromDocument({
      projectId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentContent: content,
    })

    if (!result.ok) {
      setExtracting(false)
      toast.error(`知识提取失败：${result.error.message}`)
      return
    }

    // 批量保存为 pending 草稿
    let saved = 0
    for (const draft of result.data) {
      const r = await createKnowledge({
        projectId,
        title: draft.title,
        type: draft.type,
        content: draft.content,
        summary: draft.summary || undefined,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        confidence: draft.confidence,
        aiUsageAllowed: true,
      })
      if (r.ok) saved++
    }
    setExtracting(false)

    if (saved > 0) {
      toast.success(`已从文档提取 ${saved} 条知识草稿，请到知识库审阅确认`)
    } else {
      toast.info('未从文档中提取到可用知识')
    }
  }

  if (loading) {
    return <LoadingState message="正在加载文档..." />
  }

  if (error || !doc) {
    return (
      <ErrorState
        error={{
          code: 'NOT_FOUND',
          message: error ?? '文档不存在',
          retryable: false,
        }}
        title="文档加载失败"
      />
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate(`/projects/${projectId}/documents`)}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          文档列表
        </button>

        <div className="h-4 w-px bg-line" />

        {/* 标题编辑 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AppIcon icon={DocumentTextIcon} size="sm" className="text-muted flex-shrink-0" />
          {titleEditing ? (
            <input
              type="text"
              className="input flex-1 max-w-md"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTitleSave()
                } else if (e.key === 'Escape') {
                  setTitle(doc.title)
                  setTitleEditing(false)
                }
              }}
              autoFocus
              disabled={titleSaving}
              maxLength={200}
            />
          ) : (
            <button
              type="button"
              className="text-sm font-semibold text-ink hover:text-brand transition-colors truncate"
              onClick={() => setTitleEditing(true)}
              title="点击编辑标题"
            >
              {doc.title}
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={handleExtractKnowledge}
          disabled={extracting}
          title="从文档内容中提取知识草稿"
        >
          <AppIcon icon={SparklesIcon} size="sm" />
          {extracting ? '提取中...' : '提取知识'}
        </button>
      </div>

      {/* 编辑器 */}
      <div className="flex-1 overflow-hidden bg-surface/40">
        <Editor
          key={doc.id}
          documentId={doc.id}
          projectId={doc.projectId}
          initialContent={doc.contentJson}
          contentVersion={editorContentVersion}
        />
      </div>

      {/* 检查面板：小说项目显示拼写检查，其他项目显示论文完整性 */}
      {projectType === 'fiction' ? (
        <SpellCheckPanel documentId={doc.id} />
      ) : projectType ? (
        <PaperIntegrityPanel documentId={doc.id} />
      ) : null}
    </div>
  )
}
