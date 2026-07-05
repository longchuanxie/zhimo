// Agent Repository
// 对应表：agent_threads, agent_messages, agent_runs
// 负责助手对话线程、消息、运行记录的数据库访问
// 对应任务：DEV-068 / DEV-069 / DEV-070

import type {
  AgentThread,
  AgentMessage,
  AgentRun,
  AgentRole,
  AgentRunStatus,
  BoundObjectType,
  ContextScope,
  MessageRole,
  AdoptionStatus,
  AgentExplanation,
  EntityId,
} from '@/types'
import { select, execute } from './db'
import { mapRow, now, parseJsonField, stringifyJsonField } from './mapping'

// ============ 行映射 ============

const THREAD_FIELD_MAP: Record<keyof AgentThread, string> = {
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  agentRole: 'agent_role',
  boundObjectType: 'bound_object_type',
  boundObjectId: 'bound_object_id',
  contextScope: 'context_scope',
  threadSummary: 'thread_summary',
  status: 'status',
  messageCount: 'message_count',
  lastMessageAt: 'last_message_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

const MESSAGE_FIELD_MAP: Record<keyof AgentMessage, string> = {
  id: 'id',
  threadId: 'thread_id',
  projectId: 'project_id',
  role: 'role',
  content: 'content',
  structuredOutput: 'structured_output',
  explanation: 'explanation',
  contextPackId: 'context_pack_id',
  agentRunId: 'agent_run_id',
  adoptionStatus: 'adoption_status',
  savedAsCardId: 'saved_as_card_id',
  savedAsKnowledgeId: 'saved_as_knowledge_id',
  createdAt: 'created_at',
}

const RUN_FIELD_MAP: Record<keyof AgentRun, string> = {
  id: 'id',
  projectId: 'project_id',
  threadId: 'thread_id',
  contextPackId: 'context_pack_id',
  modelConfigId: 'model_config_id',
  modelName: 'model_name',
  status: 'status',
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  createdAt: 'created_at',
}

function mapThread(row: Record<string, unknown>): AgentThread {
  const thread = mapRow<AgentThread>(row, THREAD_FIELD_MAP)
  return {
    ...thread,
    messageCount: Number(thread.messageCount),
  }
}

function mapMessage(row: Record<string, unknown>): AgentMessage {
  const msg = mapRow<AgentMessage>(row, MESSAGE_FIELD_MAP)
  return {
    ...msg,
    structuredOutput: parseJsonField<unknown>(msg.structuredOutput, null),
    explanation: parseJsonField<AgentExplanation | null>(msg.explanation, null),
  }
}

function mapRun(row: Record<string, unknown>): AgentRun {
  const run = mapRow<AgentRun>(row, RUN_FIELD_MAP)
  return {
    ...run,
    inputTokens: Number(run.inputTokens),
    outputTokens: Number(run.outputTokens),
  }
}

// ============ Thread ============

/// 查询项目的对话线程列表
///
/// @param projectId 项目 ID
/// @param limit 最大返回数量（默认 50，避免长对话历史导致内存压力）
export async function listThreads(
  projectId: EntityId,
  limit = 50,
): Promise<AgentThread[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_threads WHERE project_id = ? AND status = \'active\' ORDER BY updated_at DESC LIMIT ?',
    [projectId, limit],
  )
  return rows.map(mapThread)
}

/// 根据 ID 查询线程
export async function findThreadById(id: EntityId): Promise<AgentThread | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_threads WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapThread(rows[0]!)
}

/// 查询绑定到指定对象的线程
export async function findThreadByBoundObject(
  projectId: EntityId,
  boundObjectType: BoundObjectType,
  boundObjectId: EntityId,
): Promise<AgentThread | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_threads WHERE project_id = ? AND bound_object_type = ? AND bound_object_id = ? AND status = \'active\' ORDER BY updated_at DESC LIMIT 1',
    [projectId, boundObjectType, boundObjectId],
  )
  if (rows.length === 0) return null
  return mapThread(rows[0]!)
}

/// 创建线程
export async function insertThread(input: {
  id: EntityId
  projectId: EntityId
  title: string
  agentRole: AgentRole
  boundObjectType: BoundObjectType
  boundObjectId: EntityId | null
  contextScope: ContextScope
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO agent_threads (
      id, project_id, title, agent_role, bound_object_type, bound_object_id,
      context_scope, thread_summary, status, message_count, last_message_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'active', 0, NULL, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.title,
      input.agentRole,
      input.boundObjectType,
      input.boundObjectId,
      input.contextScope,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新线程摘要
export async function updateThreadSummary(
  id: EntityId,
  summary: string | null,
): Promise<void> {
  await execute(
    'UPDATE agent_threads SET thread_summary = ?, updated_at = ? WHERE id = ?',
    [summary, now(), id],
  )
}

/// 更新线程标题
export async function updateThreadTitle(
  id: EntityId,
  title: string,
): Promise<void> {
  await execute(
    'UPDATE agent_threads SET title = ?, updated_at = ? WHERE id = ?',
    [title, now(), id],
  )
}

/// 更新线程消息计数与最后消息时间
export async function bumpThreadMessageStats(
  id: EntityId,
): Promise<void> {
  await execute(
    `UPDATE agent_threads
     SET message_count = message_count + 1,
         last_message_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [now(), now(), id],
  )
}

/// 归档线程
export async function archiveThread(id: EntityId): Promise<void> {
  await execute(
    'UPDATE agent_threads SET status = \'archived\', updated_at = ? WHERE id = ?',
    [now(), id],
  )
}

// ============ Message ============

/// 查询线程的消息列表（按时间正序）
///
/// 为避免长对话历史导致内存压力，默认仅返回最近 100 条消息。
/// 实现方式：先按 created_at DESC 取最近 limit 条，再在内存中反转为正序。
///
/// @param threadId 线程 ID
/// @param limit 最大返回数量（默认 100）
export async function listMessages(
  threadId: EntityId,
  limit = 100,
): Promise<AgentMessage[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?',
    [threadId, limit],
  )
  // 反转为时间正序，保持原有调用方期望
  return rows.reverse().map(mapMessage)
}

/// 根据 ID 查询消息
export async function findMessageById(id: EntityId): Promise<AgentMessage | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_messages WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapMessage(rows[0]!)
}

/// 创建消息
export async function insertMessage(input: {
  id: EntityId
  threadId: EntityId
  projectId: EntityId
  role: MessageRole
  content: string
  structuredOutput: unknown | null
  explanation: AgentExplanation | null
  contextPackId: EntityId | null
  agentRunId: EntityId | null
  adoptionStatus: AdoptionStatus
}): Promise<void> {
  await execute(
    `INSERT INTO agent_messages (
      id, thread_id, project_id, role, content,
      structured_output, explanation,
      context_pack_id, agent_run_id,
      adoption_status, saved_as_card_id, saved_as_knowledge_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    [
      input.id,
      input.threadId,
      input.projectId,
      input.role,
      input.content,
      input.structuredOutput ? stringifyJsonField(input.structuredOutput) : null,
      input.explanation ? stringifyJsonField(input.explanation) : null,
      input.contextPackId,
      input.agentRunId,
      input.adoptionStatus,
      now(),
    ],
  )
}

/// 更新消息采纳状态
export async function updateMessageAdoption(
  id: EntityId,
  adoptionStatus: AdoptionStatus,
  savedAsCardId: EntityId | null,
  savedAsKnowledgeId: EntityId | null,
): Promise<void> {
  await execute(
    'UPDATE agent_messages SET adoption_status = ?, saved_as_card_id = ?, saved_as_knowledge_id = ? WHERE id = ?',
    [adoptionStatus, savedAsCardId, savedAsKnowledgeId, id],
  )
}

// ============ Run ============

/// 根据 ID 查询运行记录
export async function findRunById(id: EntityId): Promise<AgentRun | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_runs WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapRun(rows[0]!)
}

/// 查询线程的运行记录
export async function listRunsByThread(threadId: EntityId): Promise<AgentRun[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM agent_runs WHERE thread_id = ? ORDER BY created_at DESC',
    [threadId],
  )
  return rows.map(mapRun)
}

/// 创建运行记录
export async function insertRun(input: {
  id: EntityId
  projectId: EntityId
  threadId: EntityId
  contextPackId: EntityId
  modelConfigId: EntityId | null
  modelName: string | null
}): Promise<void> {
  await execute(
    `INSERT INTO agent_runs (
      id, project_id, thread_id, context_pack_id, model_config_id, model_name,
      status, input_tokens, output_tokens, error_code, error_message,
      started_at, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, NULL, NULL, NULL, NULL, ?)`,
    [
      input.id,
      input.projectId,
      input.threadId,
      input.contextPackId,
      input.modelConfigId,
      input.modelName,
      now(),
    ],
  )
}

/// 更新运行状态为 running
export async function markRunRunning(id: EntityId): Promise<void> {
  await execute(
    'UPDATE agent_runs SET status = \'running\', started_at = ? WHERE id = ?',
    [now(), id],
  )
}

/// 更新运行状态为 succeeded
export async function markRunSucceeded(
  id: EntityId,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await execute(
    'UPDATE agent_runs SET status = \'succeeded\', input_tokens = ?, output_tokens = ?, completed_at = ? WHERE id = ?',
    [inputTokens, outputTokens, now(), id],
  )
}

/// 更新运行状态为 failed
export async function markRunFailed(
  id: EntityId,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await execute(
    'UPDATE agent_runs SET status = \'failed\', error_code = ?, error_message = ?, completed_at = ? WHERE id = ?',
    [errorCode, errorMessage, now(), id],
  )
}

/// 更新运行状态为 cancelled
export async function markRunCancelled(id: EntityId): Promise<void> {
  await execute(
    'UPDATE agent_runs SET status = \'cancelled\', completed_at = ? WHERE id = ?',
    [now(), id],
  )
}

/// 更新运行记录的模型信息
export async function updateRunModelInfo(
  id: EntityId,
  modelConfigId: EntityId | null,
  modelName: string | null,
): Promise<void> {
  await execute(
    'UPDATE agent_runs SET model_config_id = ?, model_name = ? WHERE id = ?',
    [modelConfigId, modelName, id],
  )
}

export type { AgentRunStatus }
