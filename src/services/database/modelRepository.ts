// 模型 Repository
// 对应表：model_providers, model_configs
// 负责所有模型服务商与任务模型配置的数据库访问
// 对应任务：DEV-061 / DEV-062

import type {
  ModelProvider,
  ModelConfig,
  ModelTaskType,
  ConnectionStatus,
  EntityId,
} from '@/types'
import { select, execute } from './db'
import { mapRow, now } from './mapping'

// ============ 行映射 ============

const PROVIDER_FIELD_MAP: Record<keyof ModelProvider, string> = {
  id: 'id',
  workspaceId: 'workspace_id',
  name: 'name',
  type: 'type',
  baseUrl: 'base_url',
  apiKeyEncrypted: 'api_key_encrypted',
  apiKeyMasked: 'api_key_masked',
  defaultModelName: 'default_model_name',
  defaultModelContextLength: 'default_model_context_length',
  connectionStatus: 'connection_status',
  enabled: 'enabled',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

const CONFIG_FIELD_MAP: Record<keyof ModelConfig, string> = {
  id: 'id',
  workspaceId: 'workspace_id',
  providerId: 'provider_id',
  taskType: 'task_type',
  modelName: 'model_name',
  temperature: 'temperature',
  maxOutputTokens: 'max_output_tokens',
  enabled: 'enabled',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function mapProvider(row: Record<string, unknown>): ModelProvider {
  const provider = mapRow<ModelProvider>(row, PROVIDER_FIELD_MAP)
  return {
    ...provider,
    enabled: Boolean(provider.enabled),
    defaultModelContextLength:
      provider.defaultModelContextLength != null
        ? Number(provider.defaultModelContextLength)
        : null,
  }
}

function mapConfig(row: Record<string, unknown>): ModelConfig {
  const config = mapRow<ModelConfig>(row, CONFIG_FIELD_MAP)
  return {
    ...config,
    temperature: Number(config.temperature),
    maxOutputTokens: Number(config.maxOutputTokens),
    enabled: Boolean(config.enabled),
  }
}

// ============ Provider ============

/// 查询工作空间下所有模型服务商
export async function listProviders(
  workspaceId: EntityId,
): Promise<ModelProvider[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM model_providers WHERE workspace_id = ? ORDER BY created_at ASC',
    [workspaceId],
  )
  return rows.map(mapProvider)
}

/// 根据 ID 查询服务商
export async function findProviderById(
  id: EntityId,
): Promise<ModelProvider | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM model_providers WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapProvider(rows[0]!)
}

/// 创建服务商
export async function insertProvider(input: {
  id: EntityId
  workspaceId: EntityId
  name: string
  type: string
  baseUrl: string
  apiKeyEncrypted: string | null
  apiKeyMasked: string | null
  defaultModelName: string
  defaultModelContextLength: number | null
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO model_providers (
      id, workspace_id, name, type, base_url,
      api_key_encrypted, api_key_masked, default_model_name,
      default_model_context_length,
      connection_status, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'untested', 1, ?, ?)`,
    [
      input.id,
      input.workspaceId,
      input.name,
      input.type,
      input.baseUrl,
      input.apiKeyEncrypted,
      input.apiKeyMasked,
      input.defaultModelName,
      input.defaultModelContextLength,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新服务商基本信息（不含 API Key）
export async function updateProvider(
  id: EntityId,
  patch: Partial<{
    name: string
    baseUrl: string
    defaultModelName: string
    defaultModelContextLength: number | null
    enabled: boolean
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.name !== undefined) {
    fields.push('name = ?')
    params.push(patch.name)
  }
  if (patch.baseUrl !== undefined) {
    fields.push('base_url = ?')
    params.push(patch.baseUrl)
  }
  if (patch.defaultModelName !== undefined) {
    fields.push('default_model_name = ?')
    params.push(patch.defaultModelName)
  }
  if (patch.defaultModelContextLength !== undefined) {
    fields.push('default_model_context_length = ?')
    params.push(patch.defaultModelContextLength)
  }
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?')
    params.push(patch.enabled ? 1 : 0)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(
    `UPDATE model_providers SET ${fields.join(', ')} WHERE id = ?`,
    params,
  )
}

/// 更新服务商 API Key
export async function updateProviderApiKey(
  id: EntityId,
  apiKeyEncrypted: string | null,
  apiKeyMasked: string | null,
): Promise<void> {
  await execute(
    'UPDATE model_providers SET api_key_encrypted = ?, api_key_masked = ?, updated_at = ? WHERE id = ?',
    [apiKeyEncrypted, apiKeyMasked, now(), id],
  )
}

/// 更新服务商连接状态
export async function updateProviderConnectionStatus(
  id: EntityId,
  status: ConnectionStatus,
): Promise<void> {
  await execute(
    'UPDATE model_providers SET connection_status = ?, updated_at = ? WHERE id = ?',
    [status, now(), id],
  )
}

/// 删除服务商
export async function deleteProvider(id: EntityId): Promise<void> {
  await execute('DELETE FROM model_providers WHERE id = ?', [id])
}

// ============ Config ============

/// 查询工作空间下所有任务模型配置
export async function listConfigs(
  workspaceId: EntityId,
): Promise<ModelConfig[]> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM model_configs WHERE workspace_id = ? ORDER BY task_type ASC',
    [workspaceId],
  )
  return rows.map(mapConfig)
}

/// 根据任务类型查询配置
export async function findConfigByTask(
  workspaceId: EntityId,
  taskType: ModelTaskType,
): Promise<ModelConfig | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM model_configs WHERE workspace_id = ? AND task_type = ?',
    [workspaceId, taskType],
  )
  if (rows.length === 0) return null
  return mapConfig(rows[0]!)
}

/// 根据 ID 查询配置
export async function findConfigById(
  id: EntityId,
): Promise<ModelConfig | null> {
  const rows = await select<Record<string, unknown>>(
    'SELECT * FROM model_configs WHERE id = ?',
    [id],
  )
  if (rows.length === 0) return null
  return mapConfig(rows[0]!)
}

/// 创建任务模型配置
export async function insertConfig(input: {
  id: EntityId
  workspaceId: EntityId
  providerId: EntityId
  taskType: ModelTaskType
  modelName: string
  temperature: number
  maxOutputTokens: number
}): Promise<void> {
  const timestamp = now()
  await execute(
    `INSERT INTO model_configs (
      id, workspace_id, provider_id, task_type, model_name,
      temperature, max_output_tokens, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      input.id,
      input.workspaceId,
      input.providerId,
      input.taskType,
      input.modelName,
      input.temperature,
      input.maxOutputTokens,
      timestamp,
      timestamp,
    ],
  )
}

/// 更新任务模型配置
export async function updateConfig(
  id: EntityId,
  patch: Partial<{
    providerId: string
    modelName: string
    temperature: number
    maxOutputTokens: number
    enabled: boolean
  }>,
): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.providerId !== undefined) {
    fields.push('provider_id = ?')
    params.push(patch.providerId)
  }
  if (patch.modelName !== undefined) {
    fields.push('model_name = ?')
    params.push(patch.modelName)
  }
  if (patch.temperature !== undefined) {
    fields.push('temperature = ?')
    params.push(patch.temperature)
  }
  if (patch.maxOutputTokens !== undefined) {
    fields.push('max_output_tokens = ?')
    params.push(patch.maxOutputTokens)
  }
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?')
    params.push(patch.enabled ? 1 : 0)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await execute(`UPDATE model_configs SET ${fields.join(', ')} WHERE id = ?`, params)
}

/// 删除任务模型配置
export async function deleteConfig(id: EntityId): Promise<void> {
  await execute('DELETE FROM model_configs WHERE id = ?', [id])
}
