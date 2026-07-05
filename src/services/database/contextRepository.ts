// ContextPack Repository
// 对应表：context_packs
// 负责上下文快照的数据库访问
// 对应任务：DEV-071
//
// 设计说明：
// ContextPack 是不可变快照，创建后不更新。
// 排除规则在预览阶段（ContextPreview）处理，最终快照只保存用户确认后的内容。

import type { ContextPack, ContextEntry, AgentTaskType, ContextScope, EntityId } from '@/types'
import { select, execute } from './db'
import { mapRow, now, parseJsonField, stringifyJsonField } from './mapping'

// ============ 行映射 ============

const CONTEXT_PACK_FIELD_MAP: Record<keyof ContextPack, string> = {
  id: 'id',
  projectId: 'project_id',
  threadId: 'thread_id',
  taskType: 'task_type',
  userInstruction: 'user_instruction',
  contextScope: 'context_scope',
  selectedText: 'selected_text',
  documentIds: 'document_ids',
  sourceIds: 'source_ids',
  sourceChunkIds: 'source_chunk_ids',
  cardIds: 'card_ids',
  knowledgeIds: 'knowledge_ids',
  outlineNodeIds: 'outline_node_ids',
  previousMessageIds: 'previous_message_ids',
  projectRulesSnapshot: 'project_rules_snapshot',
  contextSummary: 'context_summary',
  tokenEstimate: 'token_estimate',
  entries: 'entries_json',
  createdAt: 'created_at',
}

function mapContextPack(row: Record<string, unknown>): ContextPack {
  const pack = mapRow<ContextPack>(row, CONTEXT_PACK_FIELD_MAP)
  return {
    ...pack,
    documentIds: parseJsonField<EntityId[]>(pack.documentIds, []),
    sourceIds: parseJsonField<EntityId[]>(pack.sourceIds, []),
    sourceChunkIds: parseJsonField<EntityId[]>(pack.sourceChunkIds, []),
    cardIds: parseJsonField<EntityId[]>(pack.cardIds, []),
    knowledgeIds: parseJsonField<EntityId[]>(pack.knowledgeIds, []),
    outlineNodeIds: parseJsonField<EntityId[]>(pack.outlineNodeIds, []),
    previousMessageIds: parseJsonField<EntityId[]>(pack.previousMessageIds, []),
    projectRulesSnapshot: parseJsonField<unknown>(pack.projectRulesSnapshot, null),
    tokenEstimate: Number(pack.tokenEstimate),
    entries: parseJsonField<ContextEntry[]>(pack.entries, []),
  }
}

// ============ 查询 ============

/// 根据 ID 查询 ContextPack
export async function findContextPackById(
  id: EntityId,
): Promise<ContextPack | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM context_packs WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapContextPack(rows[0]!)
}

/// 查询线程的 ContextPack 列表（按时间倒序）
export async function listContextPacksByThread(
  threadId: EntityId,
): Promise<ContextPack[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM context_packs WHERE thread_id = ? ORDER BY created_at DESC',
    [threadId],
  )
  return rows.map(mapContextPack)
}

// ============ 写入 ============

/// 创建 ContextPack 快照
export async function insertContextPack(input: {
  id: EntityId
  projectId: EntityId
  threadId: EntityId | null
  taskType: AgentTaskType
  userInstruction: string | null
  contextScope: ContextScope
  selectedText: string | null
  documentIds: EntityId[]
  sourceIds: EntityId[]
  sourceChunkIds: EntityId[]
  cardIds: EntityId[]
  knowledgeIds: EntityId[]
  outlineNodeIds: EntityId[]
  previousMessageIds: EntityId[]
  projectRulesSnapshot: unknown | null
  contextSummary: string | null
  tokenEstimate: number
  entries: ContextEntry[]
}): Promise<void> {
  await execute(
    `INSERT INTO context_packs (
      id, project_id, thread_id, task_type, user_instruction,
      context_scope, selected_text,
      document_ids, source_ids, source_chunk_ids, card_ids, knowledge_ids,
      outline_node_ids, previous_message_ids, project_rules_snapshot,
      context_summary, token_estimate, entries_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.projectId,
      input.threadId,
      input.taskType,
      input.userInstruction,
      input.contextScope,
      input.selectedText,
      stringifyJsonField(input.documentIds),
      stringifyJsonField(input.sourceIds),
      stringifyJsonField(input.sourceChunkIds),
      stringifyJsonField(input.cardIds),
      stringifyJsonField(input.knowledgeIds),
      stringifyJsonField(input.outlineNodeIds),
      stringifyJsonField(input.previousMessageIds),
      stringifyJsonField(input.projectRulesSnapshot),
      input.contextSummary,
      input.tokenEstimate,
      stringifyJsonField(input.entries),
      now(),
    ],
  )
}
