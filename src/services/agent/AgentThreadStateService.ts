// Agent 多轮工作状态 Service
// 负责维护线程级当前目标、已采纳决策与已拒绝方向，供 ContextPack 注入后续对话。

import type {
  AgentMessage,
  AgentTaskType,
  AgentThreadState,
  BoundObjectType,
  EntityId,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  findThreadStateByThreadId,
  upsertThreadState,
} from '@/services/database/agentThreadStateRepository'
import { findDocumentById } from '@/services/database/documentRepository'
import { findOutlineNodeById } from '@/services/database/outlineRepository'
import { findContextPackById } from '@/services/database/contextRepository'
import { inferAdoptDestination, type AdoptDestination } from './AdoptionIntentService'

const MAX_LIST_ITEMS = 12
const MAX_ITEM_LENGTH = 120
const WRITING_CLARIFICATION_PREFIX = 'writing_intent_clarification:'

export type UpdateThreadStateFromContextInput = {
  projectId: EntityId
  threadId: EntityId
  contextPackId: EntityId
  taskType: AgentTaskType
  userInstruction?: string | null
  selectedText?: string | null
  boundObjectType?: BoundObjectType
  boundObjectId?: EntityId | null
  currentDocumentId?: EntityId | null
}

export async function getThreadState(
  threadId: EntityId,
): Promise<ServiceResult<AgentThreadState | null>> {
  try {
    return ok(await findThreadStateByThreadId(threadId))
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export async function updateThreadStateFromContext(
  input: UpdateThreadStateFromContextInput,
): Promise<ServiceResult<AgentThreadState>> {
  try {
    const currentGoal = inferGoal(input.userInstruction)
    const userConstraints = inferUserConstraints(input.userInstruction)

    const existing = await findThreadStateByThreadId(input.threadId)
    const activeDocumentId = await resolveValidDocumentId(
      input.projectId,
      inferActiveDocumentId(input),
      existing?.activeDocumentId ?? null,
    )
    const activeOutlineNodeId = await resolveValidOutlineNodeId(
      input.projectId,
      inferActiveOutlineNodeId(input),
      existing?.activeOutlineNodeId ?? null,
    )
    const lastContextPackId = await resolveValidContextPackId(
      input.projectId,
      input.contextPackId,
    )
    const nextConstraints = mergeLimited(
      existing?.userConstraints ?? [],
      userConstraints,
    )

    const state = await upsertThreadState({
      projectId: input.projectId,
      threadId: input.threadId,
      currentGoal: currentGoal ?? existing?.currentGoal ?? null,
      currentStep: inferCurrentStep(input.taskType),
      userConstraints: nextConstraints,
      activeDocumentId,
      activeOutlineNodeId,
      lastContextPackId,
    })
    return ok(state)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export async function recordAcceptedDecision(input: {
  message: AgentMessage
  destination: AdoptDestination
  title?: string | null
}): Promise<ServiceResult<AgentThreadState>> {
  try {
    const existing = await findThreadStateByThreadId(input.message.threadId)
    const acceptedDecisions = appendLimited(
      existing?.acceptedDecisions ?? [],
      buildDecisionSummary('已采纳', input.destination, input.title, input.message.content),
    )

    const state = await upsertThreadState({
      projectId: input.message.projectId,
      threadId: input.message.threadId,
      acceptedDecisions,
      currentStep: '已采纳，等待下一步',
    })
    return ok(state)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export async function recordRejectedDirection(
  message: AgentMessage,
): Promise<ServiceResult<AgentThreadState>> {
  try {
    const existing = await findThreadStateByThreadId(message.threadId)
    const rejectedDirections = appendLimited(
      existing?.rejectedDirections ?? [],
      buildDecisionSummary('已拒绝', null, null, message.content),
    )

    const state = await upsertThreadState({
      projectId: message.projectId,
      threadId: message.threadId,
      rejectedDirections,
      currentStep: '用户拒绝上一版方向，需要调整',
    })
    return ok(state)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export type PendingWritingIntentClarification = {
  targetLabel: string
  documentId: EntityId | null
  outlineNodeId: EntityId | null
}

export async function recordWritingIntentClarification(input: {
  projectId: EntityId
  threadId: EntityId
  contextPackId: EntityId
  targetLabel: string
  documentId?: EntityId | null
  outlineNodeId?: EntityId | null
}): Promise<ServiceResult<AgentThreadState>> {
  try {
    const existing = await findThreadStateByThreadId(input.threadId)
    const markerDocumentId = await resolveValidDocumentId(
      input.projectId,
      input.documentId ?? null,
      null,
    )
    const markerOutlineNodeId = await resolveValidOutlineNodeId(
      input.projectId,
      input.outlineNodeId ?? null,
      null,
    )
    const activeDocumentId = await resolveValidDocumentId(
      input.projectId,
      markerDocumentId,
      existing?.activeDocumentId ?? null,
    )
    const activeOutlineNodeId = await resolveValidOutlineNodeId(
      input.projectId,
      markerOutlineNodeId,
      existing?.activeOutlineNodeId ?? null,
    )
    const lastContextPackId = await resolveValidContextPackId(
      input.projectId,
      input.contextPackId,
    )
    const marker = buildWritingClarificationMarker({
      targetLabel: input.targetLabel,
      documentId: markerDocumentId,
      outlineNodeId: markerOutlineNodeId,
    })
    const unresolvedQuestions = appendLimited(
      removeWritingClarificationMarkers(existing?.unresolvedQuestions ?? []),
      marker,
    )

    const state = await upsertThreadState({
      projectId: input.projectId,
      threadId: input.threadId,
      currentGoal: `完成${input.targetLabel}正文编写`,
      currentStep: '等待用户确认正文处理方式',
      activeDocumentId,
      activeOutlineNodeId,
      lastContextPackId,
      unresolvedQuestions,
    })
    return ok(state)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export function findPendingWritingIntentClarification(
  state: AgentThreadState | null,
): PendingWritingIntentClarification | null {
  if (!state) return null
  for (let index = state.unresolvedQuestions.length - 1; index >= 0; index--) {
    const parsed = parseWritingClarificationMarker(
      state.unresolvedQuestions[index]!,
    )
    if (parsed) return parsed
  }
  return null
}

export function buildThreadStatePreview(state: AgentThreadState): string {
  const lines: string[] = []
  if (state.currentGoal) lines.push(`当前目标：${state.currentGoal}`)
  if (state.currentStep) lines.push(`当前步骤：${state.currentStep}`)
  if (state.activeDocumentId) lines.push(`活跃文档：${state.activeDocumentId}`)
  if (state.activeOutlineNodeId) lines.push(`活跃大纲节点：${state.activeOutlineNodeId}`)
  if (state.userConstraints.length > 0) {
    lines.push(`用户约束：${state.userConstraints.join('；')}`)
  }
  if (state.acceptedDecisions.length > 0) {
    lines.push(`已采纳：${state.acceptedDecisions.join('；')}`)
  }
  if (state.rejectedDirections.length > 0) {
    lines.push(`已拒绝方向：${state.rejectedDirections.join('；')}`)
  }
  if (state.unresolvedQuestions.length > 0) {
    const questions = state.unresolvedQuestions.map(formatUnresolvedQuestion)
    lines.push(`待澄清：${questions.join('；')}`)
  }
  return lines.join('\n')
}

function buildWritingClarificationMarker(
  input: PendingWritingIntentClarification,
): string {
  return `${WRITING_CLARIFICATION_PREFIX}${JSON.stringify(input)}`
}

function parseWritingClarificationMarker(
  value: string,
): PendingWritingIntentClarification | null {
  if (!value.startsWith(WRITING_CLARIFICATION_PREFIX)) return null
  try {
    const parsed = JSON.parse(
      value.slice(WRITING_CLARIFICATION_PREFIX.length),
    ) as Partial<PendingWritingIntentClarification>
    if (!parsed.targetLabel) return null
    return {
      targetLabel: parsed.targetLabel,
      documentId: parsed.documentId ?? null,
      outlineNodeId: parsed.outlineNodeId ?? null,
    }
  } catch {
    return null
  }
}

function removeWritingClarificationMarkers(items: string[]): string[] {
  return items.filter((item) => !item.startsWith(WRITING_CLARIFICATION_PREFIX))
}

function formatUnresolvedQuestion(value: string): string {
  const pending = parseWritingClarificationMarker(value)
  if (!pending) return value
  return `待确认${pending.targetLabel}正文处理方式`
}

function inferGoal(userInstruction?: string | null): string | null {
  const trimmed = userInstruction?.trim()
  if (!trimmed) return null
  return truncate(trimmed, MAX_ITEM_LENGTH)
}

function inferCurrentStep(taskType: AgentTaskType): string {
  switch (taskType) {
    case 'generate_outline':
      return '正在规划大纲'
    case 'generate_card':
      return '正在提取卡片'
    case 'rewrite':
    case 'expand':
    case 'format_text':
      return '正在处理正文'
    case 'summarize':
      return '正在摘要内容'
    case 'check_source':
      return '正在检查资料来源'
    case 'answer_question':
    default:
      return '正在自由协作'
  }
}

function inferActiveDocumentId(
  input: UpdateThreadStateFromContextInput,
): EntityId | null {
  if (input.currentDocumentId) return input.currentDocumentId
  if (input.boundObjectType === 'document') return input.boundObjectId ?? null
  const destination = inferAdoptDestination({
    content: '',
    taskType: input.taskType,
    userInstruction: input.userInstruction,
  })
  return destination === 'document' ? input.boundObjectId ?? null : null
}

function inferActiveOutlineNodeId(
  input: UpdateThreadStateFromContextInput,
): EntityId | null {
  return input.boundObjectType === 'outline_node' ? input.boundObjectId ?? null : null
}

function inferUserConstraints(userInstruction?: string | null): string[] {
  const trimmed = userInstruction?.trim()
  if (!trimmed) return []
  if (!/(?:不要|不能|禁止|必须|保持|风格|字数|口吻|读者|第三人称|第一人称)/.test(trimmed)) {
    return []
  }
  return [truncate(trimmed, MAX_ITEM_LENGTH)]
}

async function resolveValidDocumentId(
  projectId: EntityId,
  preferredId: EntityId | null,
  fallbackId: EntityId | null,
): Promise<EntityId | null> {
  for (const id of uniqueIds([preferredId, fallbackId])) {
    const document = await findDocumentById(id)
    if (document?.projectId === projectId) return id
  }
  return null
}

async function resolveValidOutlineNodeId(
  projectId: EntityId,
  preferredId: EntityId | null,
  fallbackId: EntityId | null,
): Promise<EntityId | null> {
  for (const id of uniqueIds([preferredId, fallbackId])) {
    const node = await findOutlineNodeById(id)
    if (node?.projectId === projectId) return id
  }
  return null
}

async function resolveValidContextPackId(
  projectId: EntityId,
  contextPackId: EntityId | null,
): Promise<EntityId | null> {
  if (!contextPackId) return null
  const pack = await findContextPackById(contextPackId)
  return pack?.projectId === projectId ? contextPackId : null
}

function uniqueIds(ids: Array<EntityId | null>): EntityId[] {
  return Array.from(new Set(ids.filter(Boolean) as EntityId[]))
}

function buildDecisionSummary(
  prefix: string,
  destination: AdoptDestination | null,
  title: string | null | undefined,
  content: string,
): string {
  const destinationLabel = destination ? `到${destinationLabelMap[destination]}` : ''
  const titlePart = title ? `「${truncate(title, 30)}」` : ''
  const contentPart = truncate(content.replace(/\s+/g, ' '), 60)
  return `${prefix}${destinationLabel}${titlePart}：${contentPart}`
}

const destinationLabelMap: Record<AdoptDestination, string> = {
  document: '正文',
  outline: '大纲',
  card: '卡片',
  knowledge: '知识',
}

function mergeLimited(existing: string[], additions: string[]): string[] {
  let next = existing
  for (const item of additions) {
    next = appendLimited(next, item)
  }
  return next
}

function appendLimited(items: string[], item: string): string[] {
  const normalized = truncate(item.trim(), MAX_ITEM_LENGTH)
  if (!normalized) return items
  const withoutDuplicate = items.filter((existing) => existing !== normalized)
  return [...withoutDuplicate, normalized].slice(-MAX_LIST_ITEMS)
}

function truncate(text: string, maxLength: number): string {
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return `${chars.slice(0, maxLength).join('')}...`
}
