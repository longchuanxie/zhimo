// Agent Thread State Repository
// 对应表：agent_thread_states
// 负责 Agent 多轮工作状态的数据库访问。

import type { AgentThreadState, EntityId } from '@/types'
import { select, execute } from './db'
import { generateId, mapRow, now, parseJsonField, stringifyJsonField } from './mapping'

const THREAD_STATE_FIELD_MAP: Record<keyof AgentThreadState, string> = {
  id: 'id',
  projectId: 'project_id',
  threadId: 'thread_id',
  currentGoal: 'current_goal',
  currentStep: 'current_step',
  userConstraints: 'user_constraints',
  acceptedDecisions: 'accepted_decisions',
  rejectedDirections: 'rejected_directions',
  activeDocumentId: 'active_document_id',
  activeOutlineNodeId: 'active_outline_node_id',
  lastContextPackId: 'last_context_pack_id',
  unresolvedQuestions: 'unresolved_questions',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapThreadState(row: Record<string, unknown>): AgentThreadState {
  const state = mapRow<AgentThreadState>(row, THREAD_STATE_FIELD_MAP)
  return {
    ...state,
    userConstraints: parseJsonField<string[]>(state.userConstraints, []),
    acceptedDecisions: parseJsonField<string[]>(state.acceptedDecisions, []),
    rejectedDirections: parseJsonField<string[]>(state.rejectedDirections, []),
    unresolvedQuestions: parseJsonField<string[]>(state.unresolvedQuestions, []),
  }
}

export async function findThreadStateByThreadId(
  threadId: EntityId,
): Promise<AgentThreadState | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_thread_states WHERE thread_id = ?',
    [threadId],
  )
  if (rows.length === 0) return null
  return mapThreadState(rows[0]!)
}

export async function upsertThreadState(input: {
  projectId: EntityId
  threadId: EntityId
  currentGoal?: string | null
  currentStep?: string | null
  userConstraints?: string[]
  acceptedDecisions?: string[]
  rejectedDirections?: string[]
  activeDocumentId?: EntityId | null
  activeOutlineNodeId?: EntityId | null
  lastContextPackId?: EntityId | null
  unresolvedQuestions?: string[]
}): Promise<AgentThreadState> {
  const existing = await findThreadStateByThreadId(input.threadId)
  const timestamp = now()

  if (!existing) {
    const id = generateId()
    await execute(
      `INSERT INTO agent_thread_states (
        id, project_id, thread_id, current_goal, current_step,
        user_constraints, accepted_decisions, rejected_directions,
        active_document_id, active_outline_node_id, last_context_pack_id,
        unresolved_questions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.threadId,
        input.currentGoal ?? null,
        input.currentStep ?? null,
        stringifyJsonField(input.userConstraints ?? []),
        stringifyJsonField(input.acceptedDecisions ?? []),
        stringifyJsonField(input.rejectedDirections ?? []),
        input.activeDocumentId ?? null,
        input.activeOutlineNodeId ?? null,
        input.lastContextPackId ?? null,
        stringifyJsonField(input.unresolvedQuestions ?? []),
        timestamp,
        timestamp,
      ],
    )
  } else {
    const hasCurrentGoal = hasOwn(input, 'currentGoal')
    const hasCurrentStep = hasOwn(input, 'currentStep')
    const hasActiveDocumentId = hasOwn(input, 'activeDocumentId')
    const hasActiveOutlineNodeId = hasOwn(input, 'activeOutlineNodeId')
    const hasLastContextPackId = hasOwn(input, 'lastContextPackId')

    await execute(
      `UPDATE agent_thread_states SET
        current_goal = ?,
        current_step = ?,
        user_constraints = ?,
        accepted_decisions = ?,
        rejected_directions = ?,
        active_document_id = ?,
        active_outline_node_id = ?,
        last_context_pack_id = ?,
        unresolved_questions = ?,
        updated_at = ?
      WHERE thread_id = ?`,
      [
        hasCurrentGoal ? input.currentGoal ?? null : existing.currentGoal,
        hasCurrentStep ? input.currentStep ?? null : existing.currentStep,
        stringifyJsonField(input.userConstraints ?? existing.userConstraints),
        stringifyJsonField(input.acceptedDecisions ?? existing.acceptedDecisions),
        stringifyJsonField(input.rejectedDirections ?? existing.rejectedDirections),
        hasActiveDocumentId
          ? input.activeDocumentId ?? null
          : existing.activeDocumentId,
        hasActiveOutlineNodeId
          ? input.activeOutlineNodeId ?? null
          : existing.activeOutlineNodeId,
        hasLastContextPackId
          ? input.lastContextPackId ?? null
          : existing.lastContextPackId,
        stringifyJsonField(input.unresolvedQuestions ?? existing.unresolvedQuestions),
        timestamp,
        input.threadId,
      ],
    )
  }

  const updated = await findThreadStateByThreadId(input.threadId)
  if (!updated) {
    throw new Error('AgentThreadState 写入后查询失败')
  }
  return updated
}

function hasOwn<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}
