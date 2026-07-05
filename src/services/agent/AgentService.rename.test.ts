// AgentService 会话命名测试
// 对应待优化项 #4:会话自动命名
//
// 覆盖链路:
// renameThread:参数校验 + 截断 + DB 更新
// autoRenameThreadIfNeeded:触发条件 + LLM 调用 + 失败回退

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { seedTable } from '@/test/fixtures/sqlMock'
import type { ServiceResult } from '@/types/service'
import type { AgentMessage, ModelConfig, ModelProvider, ModelResult } from '@/types'

// ============ mock ModelService ============
// AgentService 依赖 ModelService 的 callModel/callModelDirect/getConfigByTask/getEnabledProvider
// 用 vi.importActual 保留其他 export(如 getTaskModelContextLength),只覆盖这 4 个为可配置 mock
const callModelMock = vi.fn<(input: { modelConfigId: string; messages: Array<{ role: string; content: string }>; temperature?: number; maxOutputTokens?: number }) => Promise<ServiceResult<ModelResult>>>()
const callModelDirectMock = vi.fn<(input: { provider: ModelProvider; modelName: string; messages: Array<{ role: string; content: string }>; temperature?: number }) => Promise<ServiceResult<ModelResult>>>()
const getConfigByTaskMock = vi.fn<(taskType: string) => Promise<ServiceResult<ModelConfig | null>>>()
const getEnabledProviderMock = vi.fn<() => Promise<ServiceResult<ModelProvider | null>>>()

vi.mock('@/services/model/ModelService', async () => {
  const actual = await vi.importActual<typeof import('@/services/model/ModelService')>('@/services/model/ModelService')
  return {
    ...actual,
    callModel: callModelMock,
    callModelDirect: callModelDirectMock,
    getConfigByTask: getConfigByTaskMock,
    getEnabledProvider: getEnabledProviderMock,
  }
})

// 延迟导入,确保 mock 已注册
const { renameThread, autoRenameThreadIfNeeded } = await import('./AgentService')

// ============ 测试工具 ============

/// 解包 ServiceResult,断言成功并返回 data
function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

/// 解包 ServiceResult,断言失败并返回 error
function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) {
    throw new Error(`Expected error result but got ok: ${JSON.stringify(result.data)}`)
  }
  return result.error
}

// ============ 测试夹具 ============

const THREAD_ID = 'thread-1'
const PROJECT_ID = 'proj-1'

/// 初始化 agent_threads 表夹具
function seedThread(overrides: Partial<Record<string, unknown>> = {}) {
  seedTable('agent_threads', [
    {
      id: THREAD_ID,
      project_id: PROJECT_ID,
      title: '新对话 2025-01-01 10:00',
      agent_role: 'writing_assistant',
      bound_object_type: 'project',
      bound_object_id: PROJECT_ID,
      context_scope: 'whole_project',
      thread_summary: null,
      status: 'active',
      message_count: 0,
      last_message_at: null,
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-01T10:00:00Z',
      ...overrides,
    },
  ])
}

/// 构造用户消息夹具
function makeUserMessage(content: string): AgentMessage {
  return {
    id: 'msg-user-1',
    threadId: THREAD_ID,
    projectId: PROJECT_ID,
    role: 'user',
    content,
    structuredOutput: null,
    explanation: null,
    contextPackId: null,
    agentRunId: null,
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2025-01-01T10:00:01Z',
  }
}

/// 构造助手消息夹具
function makeAssistantMessage(): AgentMessage {
  return {
    id: 'msg-assistant-1',
    threadId: THREAD_ID,
    projectId: PROJECT_ID,
    role: 'assistant',
    content: '这是助手回复',
    structuredOutput: null,
    explanation: null,
    contextPackId: null,
    agentRunId: 'run-1',
    adoptionStatus: 'not_applied',
    savedAsCardId: null,
    savedAsKnowledgeId: null,
    createdAt: '2025-01-01T10:00:02Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // 默认 mock:无任务配置,无启用服务商
  getConfigByTaskMock.mockResolvedValue({ ok: true, data: null })
  getEnabledProviderMock.mockResolvedValue({ ok: true, data: null })
})

// ============ 测试用例 ============

describe('renameThread', () => {
  it('正常更新 title(截断到 12 字)', async () => {
    seedThread()
    // 13 字标题,应截断为 12 字
    const result = await renameThread(THREAD_ID, '这是一个超过十二个字的标题')

    const updated = unwrap(result)
    expect(updated.title).toBe('这是一个超过十二个字的标')
    expect(updated.title.length).toBe(12)
  })

  it('空 title 返回 VALIDATION_ERROR', async () => {
    seedThread()

    const error = unwrapErr(await renameThread(THREAD_ID, '   '))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('标题不能为空')
  })

  it('thread 不存在返回 AGENT_THREAD_NOT_FOUND', async () => {
    // 不 seed 任何 thread

    const error = unwrapErr(await renameThread('nonexistent', '标题'))

    expect(error.code).toBe('AGENT_THREAD_NOT_FOUND')
  })
})

describe('autoRenameThreadIfNeeded', () => {
  it('首回合 + LLM 成功 → title 更新为 LLM 返回值', async () => {
    seedThread({ message_count: 0, title: '新对话 2025-01-01 10:00' })
    // 获取真实 thread 对象(通过 renameThread 内部同样的 findThreadById 路径)
    const { findThreadById } = await import('@/services/database/agentRepository')
    const realThread = (await findThreadById(THREAD_ID))!

    // mock chat 任务有配置
    const mockConfig: ModelConfig = {
      id: 'config-1',
      workspaceId: 'ws-1',
      taskType: 'chat',
      providerId: 'provider-1',
      modelName: 'gpt-4o',
      temperature: 0.7,
      maxOutputTokens: 4096,
      enabled: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    getConfigByTaskMock.mockResolvedValueOnce({ ok: true, data: mockConfig })

    // mock LLM 返回标题
    callModelMock.mockResolvedValueOnce({
      ok: true,
      data: {
        content: '角色设定讨论',
        modelName: 'gpt-4o',
        inputTokens: 10,
        outputTokens: 5,
        raw: {},
      },
    })

    const userMessage = makeUserMessage('请帮我设定主角的性格特征')
    const assistantMessage = makeAssistantMessage()

    await autoRenameThreadIfNeeded(realThread, userMessage, assistantMessage)

    // 验证 title 已更新
    const updated = (await findThreadById(THREAD_ID))!
    expect(updated.title).toBe('角色设定讨论')
    expect(callModelMock).toHaveBeenCalledTimes(1)
  })

  it('首回合 + LLM 失败 → 回退用户消息前 20 字', async () => {
    seedThread({ message_count: 0, title: '新对话 2025-01-01 10:00' })
    const { findThreadById } = await import('@/services/database/agentRepository')
    const realThread = (await findThreadById(THREAD_ID))!

    const mockConfig: ModelConfig = {
      id: 'config-1',
      workspaceId: 'ws-1',
      taskType: 'chat',
      providerId: 'provider-1',
      modelName: 'gpt-4o',
      temperature: 0.7,
      maxOutputTokens: 4096,
      enabled: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    getConfigByTaskMock.mockResolvedValueOnce({ ok: true, data: mockConfig })
    callModelMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'MODEL_ENDPOINT_FAILED', message: '网络错误', retryable: true },
    })

    const longContent = '请帮我详细设定主角的性格特征和背景故事'
    const userMessage = makeUserMessage(longContent)
    const assistantMessage = makeAssistantMessage()

    await autoRenameThreadIfNeeded(realThread, userMessage, assistantMessage)

    const updated = (await findThreadById(THREAD_ID))!
    // fallback 截取前 20 字后,renameThread 内部再截断到 12 字
    const expectedFallback = Array.from(longContent.trim()).slice(0, 20).join('')
    const expectedTruncated = Array.from(expectedFallback).slice(0, 12).join('')
    expect(updated.title).toBe(expectedTruncated)
  })

  it('非首回合(messageCount > 0)→ 不触发 LLM 调用', async () => {
    seedThread({ message_count: 2, title: '新对话 2025-01-01 10:00' })
    const { findThreadById } = await import('@/services/database/agentRepository')
    const realThread = (await findThreadById(THREAD_ID))!

    const userMessage = makeUserMessage('第二条消息')
    const assistantMessage = makeAssistantMessage()

    await autoRenameThreadIfNeeded(realThread, userMessage, assistantMessage)

    expect(callModelMock).not.toHaveBeenCalled()
    expect(callModelDirectMock).not.toHaveBeenCalled()
    // title 应保持不变
    const updated = (await findThreadById(THREAD_ID))!
    expect(updated.title).toBe('新对话 2025-01-01 10:00')
  })

  it('title 不以"新对话"开头 → 不触发', async () => {
    seedThread({ message_count: 0, title: '已有标题' })
    const { findThreadById } = await import('@/services/database/agentRepository')
    const realThread = (await findThreadById(THREAD_ID))!

    const userMessage = makeUserMessage('请帮我设定主角')
    const assistantMessage = makeAssistantMessage()

    await autoRenameThreadIfNeeded(realThread, userMessage, assistantMessage)

    expect(callModelMock).not.toHaveBeenCalled()
    expect(callModelDirectMock).not.toHaveBeenCalled()
    const updated = (await findThreadById(THREAD_ID))!
    expect(updated.title).toBe('已有标题')
  })

  it('未配置模型(provider 也为 null)→ 回退用户消息前 20 字', async () => {
    seedThread({ message_count: 0, title: '新对话 2025-01-01 10:00' })
    const { findThreadById } = await import('@/services/database/agentRepository')
    const realThread = (await findThreadById(THREAD_ID))!

    // 默认 mock:getConfigByTask 返回 null,getEnabledProvider 返回 null
    const userMessage = makeUserMessage('请帮我设定主角')
    const assistantMessage = makeAssistantMessage()

    await autoRenameThreadIfNeeded(realThread, userMessage, assistantMessage)

    const updated = (await findThreadById(THREAD_ID))!
    expect(updated.title).toBe('请帮我设定主角')
    expect(callModelMock).not.toHaveBeenCalled()
    expect(callModelDirectMock).not.toHaveBeenCalled()
  })
})
