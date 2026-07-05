// 待确认操作 Hook
// 封装按 messageId 加载、单条 apply/reject、批量 applyAll 的逻辑
// UI 组件（PendingActionList）只消费此 hook，不直接调用 Service
//
// 设计说明：
// - 加载在 messageId 变化时触发
// - 单条 apply/reject 成功后只本地更新该条 status，不重新拉取整个列表（避免列表抖动）
// - applyAll 成功后重新拉取列表（批量操作可能涉及多条状态变化）
// - processingId 标记当前正在处理的操作 ID，UI 用于禁用按钮

import { useCallback, useEffect, useState } from 'react'
import type { PendingToolAction, EntityId } from '@/types'
import type { AppError } from '@/types/error'
import {
  listPendingActionsByMessageService,
  applyPendingAction,
  rejectPendingAction,
  applyAllPendingActions,
} from '@/services/agent/PendingActionService'
import {
  APP_EVENTS,
  type AgentPendingActionsChangedDetail,
  type DocumentContentChangedDetail,
  type DocumentCreatedDetail,
  type OutlineChangedDetail,
} from '@/constants/events'

type UsePendingActionsResult = {
  /// 当前列表（按 createdAt 正序）
  actions: PendingToolAction[]
  /// 初次加载中
  loading: boolean
  /// 初次加载错误
  error: AppError | null
  /// 当前正在处理的操作 ID（apply/reject 进行中）
  processingId: EntityId | null
  /// 是否正在批量执行
  applyingAll: boolean
  /// 单条操作错误信息（key 为 actionId）
  actionErrors: Record<EntityId, string>
  /// 执行单条
  applyAction: (actionId: EntityId) => Promise<void>
  /// 拒绝单条
  rejectAction: (actionId: EntityId) => Promise<void>
  /// 批量执行所有 pending
  applyAll: () => Promise<void>
  /// 重新拉取列表
  refresh: () => Promise<void>
}

/// 加载并管理某条助手消息关联的待确认操作
export function usePendingActions(messageId: EntityId): UsePendingActionsResult {
  const [actions, setActions] = useState<PendingToolAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [processingId, setProcessingId] = useState<EntityId | null>(null)
  const [applyingAll, setApplyingAll] = useState(false)
  const [actionErrors, setActionErrors] = useState<Record<EntityId, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listPendingActionsByMessageService(messageId)
    if (result.ok) {
      setActions(result.data)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [messageId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handleChanged = (event: Event) => {
      const detail = (event as CustomEvent<AgentPendingActionsChangedDetail>).detail
      if (!detail?.messageId || detail.messageId === messageId) {
        void load()
      }
    }

    window.addEventListener(APP_EVENTS.agentPendingActionsChanged, handleChanged)
    return () => {
      window.removeEventListener(APP_EVENTS.agentPendingActionsChanged, handleChanged)
    }
  }, [load, messageId])

  /// 本地更新单条操作状态
  const patchAction = useCallback(
    (actionId: EntityId, patch: Partial<PendingToolAction>) => {
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
      )
    },
    [],
  )

  /// 设置/清除单条错误
  const setActionError = useCallback(
    (actionId: EntityId, message: string | null) => {
      setActionErrors((prev) => {
        if (message === null) {
          const next = { ...prev }
          delete next[actionId]
          return next
        }
        return { ...prev, [actionId]: message }
      })
    },
    [],
  )

  const applyAction = useCallback(
    async (actionId: EntityId) => {
      setProcessingId(actionId)
      setActionError(actionId, null)
      const result = await applyPendingAction(actionId)
      setProcessingId(null)
      if (result.ok) {
        patchAction(actionId, {
          status: 'applied',
          appliedAt: result.data.appliedAt,
        })
        notifyDocumentContentChanged(result.data)
        notifyProjectObjectChanged(result.data)
      } else {
        setActionError(actionId, result.error.message)
      }
    },
    [patchAction, setActionError],
  )

  const rejectAction = useCallback(
    async (actionId: EntityId) => {
      setProcessingId(actionId)
      setActionError(actionId, null)
      const result = await rejectPendingAction(actionId)
      setProcessingId(null)
      if (result.ok) {
        patchAction(actionId, {
          status: 'rejected',
          appliedAt: result.data.appliedAt,
        })
      } else {
        setActionError(actionId, result.error.message)
      }
    },
    [patchAction, setActionError],
  )

  const applyAll = useCallback(async () => {
    setApplyingAll(true)
    const documentIds = collectDocumentIds(actions)
    const createActions = collectCreateDocumentActions(actions)
    const result = await applyAllPendingActions(messageId)
    setApplyingAll(false)
    if (result.ok) {
      // 批量操作后重新拉取，确保状态一致
      await load()
      if (result.data.applied > 0) {
        for (const documentId of documentIds) {
          notifyDocumentContentChangedById(documentId, messageId)
        }
        for (const action of createActions) {
          notifyProjectObjectChanged(action)
        }
      }
    } else {
      setError(result.error)
    }
  }, [actions, messageId, load])

  return {
    actions,
    loading,
    error,
    processingId,
    applyingAll,
    actionErrors,
    applyAction,
    rejectAction,
    applyAll,
    refresh: load,
  }
}

function collectDocumentIds(actions: PendingToolAction[]): EntityId[] {
  const ids = new Set<EntityId>()
  for (const action of actions) {
    if (action.status !== 'pending') continue
    const documentId = readDocumentIdFromAction(action)
    if (documentId) ids.add(documentId)
  }
  return [...ids]
}

function collectCreateDocumentActions(actions: PendingToolAction[]): PendingToolAction[] {
  return actions.filter(
    (action) => action.status === 'pending' && action.toolName === 'create_document',
  )
}

function notifyDocumentContentChanged(action: PendingToolAction) {
  const documentId = readDocumentIdFromAction(action)
  if (!documentId) return
  notifyDocumentContentChangedById(documentId, action.messageId, action.id)
}

function notifyProjectObjectChanged(action: PendingToolAction) {
  if (action.toolName !== 'create_document') return

  const projectId = readStringArg(action, 'projectId')
  if (!projectId) return

  const outlineNodeId = readStringArg(action, 'outlineNodeId') ?? undefined
  const documentDetail: DocumentCreatedDetail = {
    projectId,
    outlineNodeId,
    source: 'agent_pending_action',
    actionId: action.id,
    messageId: action.messageId,
  }
  window.dispatchEvent(
    new CustomEvent(APP_EVENTS.documentCreated, { detail: documentDetail }),
  )

  if (outlineNodeId) {
    const outlineDetail: OutlineChangedDetail = {
      projectId,
      outlineNodeId,
      source: 'agent_pending_action',
      actionId: action.id,
      messageId: action.messageId,
    }
    window.dispatchEvent(
      new CustomEvent(APP_EVENTS.outlineChanged, { detail: outlineDetail }),
    )
  }
}

function notifyDocumentContentChangedById(
  documentId: EntityId,
  messageId?: EntityId,
  actionId?: EntityId,
) {
  const detail: DocumentContentChangedDetail = {
    documentId,
    source: 'agent_pending_action',
    actionId,
    messageId,
  }
  window.dispatchEvent(
    new CustomEvent(APP_EVENTS.documentContentChanged, { detail }),
  )
}

function readDocumentIdFromAction(action: PendingToolAction): EntityId | null {
  if (action.toolName !== 'append_document_content') return null
  const value = action.args.documentId
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readStringArg(action: PendingToolAction, key: string): string | null {
  const value = action.args[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
