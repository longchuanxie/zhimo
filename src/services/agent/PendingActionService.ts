// 待确认操作 Service
// 对应表：agent_pending_actions
// 负责 Agent 工具调用中写操作的"待确认"生命周期管理
//
// 职责：
// - 查询消息/线程关联的待确认操作
// - applyPendingAction：按 toolName 路由到对应业务 Service 真正落地
// - rejectPendingAction：标记为已拒绝
// - applyAllPendingActions：批量执行
//
// 调用流程：
// 1. AgentService.sendMessage 工具循环结束后，调用 insertPendingAction 持久化
// 2. UI 通过 listPendingActionsByMessage 加载并展示
// 3. 用户点击"执行" → applyPendingAction → 路由到业务 Service → updatePendingActionStatus('applied')
// 4. 用户点击"拒绝" → rejectPendingAction → updatePendingActionStatus('rejected')

import type { AgentMessage, PendingToolAction, EntityId } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  findPendingActionById,
  insertPendingAction,
  listPendingActionsByMessage,
  updatePendingActionStatus,
} from '@/services/database/agentPendingActionRepository'
import { generateId } from '@/services/database/mapping'
import type { AdoptDestination } from '@/services/agent/AdoptionIntentService'
import {
  createOutlineNode,
  createOutlineNodesFromMarkdown,
  updateOutlineNodeService,
  deleteOutlineNode,
} from '@/services/outline/OutlineService'
import {
  createDocument,
  getDocument,
  autosaveDocument,
  setDocumentInitialContent,
} from '@/services/document/DocumentService'
import {
  applyPlainTextPatchToDocumentContent,
  plainTextToTipTapDoc,
} from '@/services/document/DocumentContentPatchService'
import {
  createCard,
  updateCard,
  updateCardStatusService,
} from '@/services/card/CardService'
import {
  createKnowledge,
  updateKnowledge,
} from '@/services/knowledge/KnowledgeService'

// ============ Service 方法 ============

export type CreatePendingActionFromAdoptionInput = {
  message: AgentMessage
  destination: AdoptDestination
  activeDocumentId?: EntityId | null
  selectedText?: string | null
}

/// 查询消息关联的待确认操作列表
export async function listPendingActionsByMessageService(
  messageId: EntityId,
): Promise<ServiceResult<PendingToolAction[]>> {
  try {
    const items = await listPendingActionsByMessage(messageId)
    return ok(items)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 将普通“采纳”转换为待确认操作
///
/// 统一采纳链路：用户点击采纳后不直接落库，而是生成 PendingAction；
/// 用户再在消息下方执行/拒绝，复用工具写操作的确认机制。
export async function createPendingActionFromAdoption(
  input: CreatePendingActionFromAdoptionInput,
): Promise<ServiceResult<PendingToolAction>> {
  try {
    const draft = buildAdoptionPendingAction(input)
    if (!draft.ok) return err(draft.error)

    const existing = await findExistingAdoptionAction(
      input.message.id,
      draft.data.toolName,
      draft.data.args,
    )
    if (existing) return ok(existing)

    const actionId = generateId()
    await insertPendingAction({
      id: actionId,
      messageId: input.message.id,
      projectId: input.message.projectId,
      threadId: input.message.threadId,
      toolName: draft.data.toolName,
      args: draft.data.args,
      summary: draft.data.summary,
      status: 'pending',
    })

    const created = await findPendingActionById(actionId)
    if (!created) {
      return err({
        code: NOT_FOUND,
        message: '待确认操作创建后查询失败',
        retryable: true,
      })
    }
    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 执行单条待确认操作
///
/// 按 toolName 路由到对应业务 Service，成功后更新状态为 applied
/// 失败时状态保持 pending，UI 可重试
export async function applyPendingAction(
  actionId: EntityId,
): Promise<ServiceResult<PendingToolAction>> {
  try {
    const action = await findPendingActionById(actionId)
    if (!action) {
      return err({
        code: NOT_FOUND,
        message: '待确认操作不存在',
        retryable: false,
      })
    }

    if (action.status !== 'pending') {
      return err({
        code: VALIDATION_ERROR,
        message: `操作已处理（状态：${action.status}），不能重复执行`,
        retryable: false,
      })
    }

    // 按 toolName 路由到对应 Service
    const result = await routeAndExecute(action)
    if (!result.ok) {
      return err(result.error)
    }

    await updatePendingActionStatus(actionId, 'applied')

    const updated = await findPendingActionById(actionId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '操作执行后查询失败',
        retryable: true,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 拒绝单条待确认操作
export async function rejectPendingAction(
  actionId: EntityId,
): Promise<ServiceResult<PendingToolAction>> {
  try {
    const action = await findPendingActionById(actionId)
    if (!action) {
      return err({
        code: NOT_FOUND,
        message: '待确认操作不存在',
        retryable: false,
      })
    }

    if (action.status !== 'pending') {
      return err({
        code: VALIDATION_ERROR,
        message: `操作已处理（状态：${action.status}），不能重复操作`,
        retryable: false,
      })
    }

    await updatePendingActionStatus(actionId, 'rejected')

    const updated = await findPendingActionById(actionId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '操作拒绝后查询失败',
        retryable: true,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 批量执行消息下所有 pending 操作
///
/// 逐条执行，单条失败不阻塞后续，返回成功/失败计数
export async function applyAllPendingActions(
  messageId: EntityId,
): Promise<ServiceResult<{ applied: number; failed: number; failedIds: EntityId[] }>> {
  try {
    const items = await listPendingActionsByMessage(messageId)
    const pendingItems = items.filter((a) => a.status === 'pending')

    let applied = 0
    let failed = 0
    const failedIds: EntityId[] = []

    for (const item of pendingItems) {
      const result = await applyPendingAction(item.id)
      if (result.ok) {
        applied++
      } else {
        failed++
        failedIds.push(item.id)
      }
    }

    return ok({ applied, failed, failedIds })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部路由 ============

type PendingActionDraft = {
  toolName: string
  args: Record<string, unknown>
  summary: string
}

function buildAdoptionPendingAction(
  input: CreatePendingActionFromAdoptionInput,
): ServiceResult<PendingActionDraft> {
  const content = input.message.content.trim()
  if (!content) {
    return err(validationError('采纳内容不能为空'))
  }

  switch (input.destination) {
    case 'document': {
      if (!input.activeDocumentId) {
        return err(validationError('请先打开一个文档，再采纳此内容'))
      }
      const selectedText = input.selectedText?.trim() ?? ''
      const mode = selectedText ? 'replace_selection' : 'append'
      return ok({
        toolName: 'append_document_content',
        args: {
          documentId: input.activeDocumentId,
          content,
          mode,
          selectedText: selectedText || undefined,
          adoptionSource: 'message_adoption',
        },
        summary:
          mode === 'replace_selection'
            ? `替换当前选区（${selectedText.length} 字 → ${content.length} 字）`
            : `追加正文内容（${content.length} 字）`,
      })
    }

    case 'outline':
      return ok({
        toolName: 'create_outline_nodes_from_markdown',
        args: {
          projectId: input.message.projectId,
          markdown: content,
          adoptionSource: 'message_adoption',
        },
        summary: '从采纳内容创建大纲节点',
      })

    case 'card': {
      const title = extractTitle(content)
      return ok({
        toolName: 'create_card',
        args: {
          projectId: input.message.projectId,
          title,
          type: 'ai_generated',
          content,
          summary: content.slice(0, 100),
          aiUsageAllowed: true,
          adoptionSource: 'message_adoption',
        },
        summary: `创建卡片「${title}」`,
      })
    }

    case 'knowledge': {
      const title = extractTitle(content)
      return ok({
        toolName: 'create_knowledge',
        args: {
          projectId: input.message.projectId,
          title,
          type: 'ai_generated',
          content,
          summary: content.slice(0, 100),
          adoptionSource: 'message_adoption',
        },
        summary: `创建知识「${title}」`,
      })
    }
  }
}

async function findExistingAdoptionAction(
  messageId: EntityId,
  toolName: string,
  args: Record<string, unknown>,
): Promise<PendingToolAction | null> {
  const items = await listPendingActionsByMessage(messageId)
  const content = typeof args.content === 'string' ? args.content : null
  const markdown = typeof args.markdown === 'string' ? args.markdown : null

  return (
    items.find((item) => {
      if (item.status !== 'pending') return false
      if (item.toolName !== toolName) return false
      if (item.args.adoptionSource !== 'message_adoption') return false
      if (content && item.args.content === content) return true
      if (markdown && item.args.markdown === markdown) return true
      return false
    }) ?? null
  )
}

function extractTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (firstLine) {
    return firstLine.replace(/^#+\s*/, '').replace(/[*_`]/g, '').slice(0, 50)
  }
  return content.slice(0, 30).trim() || 'AI 生成内容'
}

/// 按 toolName 路由到对应业务 Service 执行
///
/// 工具名与 Service 方法的映射：
/// - create_outline_node → OutlineService.createOutlineNode
/// - update_outline_node → OutlineService.updateOutlineNodeService
/// - delete_outline_node → OutlineService.deleteOutlineNode
/// - create_document → DocumentService.createDocument
/// - append_document_content → DocumentService.autosaveDocument（先读后写）
/// - create_card → CardService.createCard
/// - update_card → CardService.updateCard
/// - update_card_status → CardService.updateCardStatusService
/// - create_knowledge → KnowledgeService.createKnowledge
/// - update_knowledge → KnowledgeService.updateKnowledge
async function routeAndExecute(
  action: PendingToolAction,
): Promise<ServiceResult<unknown>> {
  const { toolName, args } = action

  switch (toolName) {
    // ===== Outline =====
    case 'create_outline_node': {
      const projectId = readRequiredString(args, 'projectId')
      const title = readRequiredString(args, 'title')
      if (!projectId || !title) {
        return err(validationError('projectId 与 title 必填'))
      }
      const parentId = readNullableString(args, 'parentId')
      const description = readNullableString(args, 'description')
      const targetWordCount = readNumberArg(args, 'targetWordCount')

      return createOutlineNode({
        projectId,
        parentId,
        title,
        description: description ?? undefined,
        targetWordCount: targetWordCount ?? undefined,
      })
    }

    case 'create_outline_nodes_from_markdown': {
      const projectId = readRequiredString(args, 'projectId')
      const markdown = readRequiredString(args, 'markdown')
      if (!projectId || !markdown) {
        return err(validationError('projectId 与 markdown 必填'))
      }
      return createOutlineNodesFromMarkdown(projectId, markdown)
    }

    case 'update_outline_node': {
      const nodeId = readRequiredString(args, 'nodeId')
      if (!nodeId) return err(validationError('nodeId 必填'))

      const patch: Record<string, unknown> = {}
      const title = readNullableString(args, 'title')
      const description = readNullableString(args, 'description')
      const status = readNullableString(args, 'status')
      const targetWordCount = readNumberArg(args, 'targetWordCount')
      if (title) patch.title = title
      if (description) patch.description = description
      if (status) patch.status = status
      if (targetWordCount !== null) patch.targetWordCount = targetWordCount

      return updateOutlineNodeService({ nodeId, patch })
    }

    case 'delete_outline_node': {
      const nodeId = readRequiredString(args, 'nodeId')
      if (!nodeId) return err(validationError('nodeId 必填'))
      return deleteOutlineNode(nodeId)
    }

    // ===== Document =====
    case 'create_document': {
      const projectId = readRequiredString(args, 'projectId')
      const title = readRequiredString(args, 'title')
      if (!projectId || !title) {
        return err(validationError('projectId 与 title 必填'))
      }
      const outlineNodeId = readNullableString(args, 'outlineNodeId')
      const content = readNullableString(args, 'content')
      const createResult = await createDocument({
        projectId,
        title,
        outlineNodeId: outlineNodeId ?? undefined,
      })
      if (!createResult.ok) return err(createResult.error)

      const plainText = content?.trim() ?? ''

      if (plainText) {
        const initialResult = await setDocumentInitialContent({
          documentId: createResult.data.id,
          contentJson: plainTextToTipTapDoc(plainText),
          plainText,
          wordCount: plainText.length,
        })
        if (!initialResult.ok) return err(initialResult.error)
      }

      if (outlineNodeId) {
        const linkResult = await updateOutlineNodeService({
          nodeId: outlineNodeId,
          patch: {
            linkedDocumentId: createResult.data.id,
            status: 'writing',
          },
        })
        if (!linkResult.ok) return err(linkResult.error)
      }

      return createResult
    }

    case 'append_document_content': {
      const documentId = readRequiredString(args, 'documentId')
      const content = readRequiredString(args, 'content')
      if (!documentId || !content) {
        return err(validationError('documentId 与 content 必填'))
      }
      const mode = readNullableString(args, 'mode') ?? 'append'
      const selectedText = readNullableString(args, 'selectedText')

      // 先读文档获取现有 plainText，再根据模式生成新正文
      const docResult = await getDocument(documentId)
      if (!docResult.ok) return err(docResult.error)

      const patchResult = applyPlainTextPatchToDocumentContent({
        contentJson: docResult.data.contentJson,
        plainText: docResult.data.plainText,
        insertText: content,
        mode,
        selectedText,
      })
      if (!patchResult.ok) return err(patchResult.error)

      return autosaveDocument({
        projectId: docResult.data.projectId,
        documentId,
        contentJson: patchResult.data.contentJson,
        plainText: patchResult.data.plainText,
        wordCount: patchResult.data.wordCount,
      })
    }

    // ===== Card =====
    case 'create_card': {
      const projectId = readRequiredString(args, 'projectId')
      const title = readRequiredString(args, 'title')
      const content = readRequiredString(args, 'content')
      if (!projectId || !title || !content) {
        return err(validationError('projectId / title / content 必填'))
      }
      const type = readRequiredString(args, 'type') ?? 'note'
      const summary = readNullableString(args, 'summary')
      const aiUsageAllowedRaw = args.aiUsageAllowed
      const aiUsageAllowed =
        typeof aiUsageAllowedRaw === 'boolean' ? aiUsageAllowedRaw : true

      return createCard({
        projectId,
        title,
        content,
        type,
        summary: summary ?? undefined,
        aiUsageAllowed,
      })
    }

    case 'update_card': {
      const cardId = readRequiredString(args, 'cardId')
      if (!cardId) return err(validationError('cardId 必填'))

      const patch: Record<string, unknown> = {}
      const title = readNullableString(args, 'title')
      const content = readNullableString(args, 'content')
      const summary = readNullableString(args, 'summary')
      if (title) patch.title = title
      if (content) patch.content = content
      if (summary) patch.summary = summary

      return updateCard({ cardId, patch })
    }

    case 'update_card_status': {
      const cardId = readRequiredString(args, 'cardId')
      const status = readRequiredString(args, 'status')
      if (!cardId || !status) {
        return err(validationError('cardId 与 status 必填'))
      }
      return updateCardStatusService(
        cardId,
        status as 'pending' | 'confirmed' | 'deprecated' | 'conflict' | 'forbidden',
      )
    }

    // ===== Knowledge =====
    case 'create_knowledge': {
      const projectId = readRequiredString(args, 'projectId')
      const title = readRequiredString(args, 'title')
      const content = readRequiredString(args, 'content')
      const type = readRequiredString(args, 'type')
      if (!projectId || !title || !content || !type) {
        return err(validationError('projectId / title / content / type 必填'))
      }
      const summary = readNullableString(args, 'summary')
      const confidence = readNumberArg(args, 'confidence')

      return createKnowledge({
        projectId,
        title,
        content,
        type,
        summary: summary ?? undefined,
        sourceType: 'agent',
        aiUsageAllowed: true,
        confidence: confidence ?? 0.7,
      })
    }

    case 'update_knowledge': {
      const knowledgeId = readRequiredString(args, 'knowledgeId')
      if (!knowledgeId) return err(validationError('knowledgeId 必填'))

      const patch: Record<string, unknown> = {}
      const title = readNullableString(args, 'title')
      const content = readNullableString(args, 'content')
      const summary = readNullableString(args, 'summary')
      if (title) patch.title = title
      if (content) patch.content = content
      if (summary) patch.summary = summary

      return updateKnowledge({ knowledgeId, patch })
    }

    default:
      return err({
        code: VALIDATION_ERROR,
        message: `未知的待确认操作工具名：${toolName}`,
        retryable: false,
      })
  }
}

// ============ 内部工具 ============

function readRequiredString(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const v = args[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function readNullableString(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const v = args[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function readNumberArg(
  args: Record<string, unknown>,
  key: string,
): number | null {
  const v = args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function validationError(message: string) {
  return {
    code: VALIDATION_ERROR,
    message,
    retryable: false,
  }
}
