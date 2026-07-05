// ModelService 单元测试：验证模型配置联动链路（待优化项 #1）
// 对应待优化项 #1：模型配置后，Agent 调用仍提示未配置
//
// 覆盖链路：
// createProvider（默认启用）→ upsertConfig（任务绑定）→ getConfigByTask（查询配置）
// → getEnabledProvider（回退查询）→ callModel / callModelDirect（模型调用）

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { seedTable } from '@/test/fixtures/sqlMock'
import type { ServiceResult } from '@/types/service'
import type { ModelInfo } from '@/types'

// ============ mock 网关层 ============
// secretGateway：encryptSecret 调用 Rust invoke，测试环境需 mock
vi.mock('@/services/secret/secretGateway', () => ({
  encryptSecret: vi.fn(async (plaintext: string) => `encrypted:${plaintext}`),
  maskApiKey: vi.fn((apiKey: string) => {
    if (apiKey.length <= 8) return '****'
    return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
  }),
}))

// modelGateway：callOpenAICompatible 与 listModels 使用可配置 mock；
// lookupModelCapability 是纯函数，复用真实实现（含 MODEL_CAPABILITY_FALLBACK 表）
const callOpenAICompatibleMock = vi.fn()
const listModelsMock = vi.fn<(input: { baseUrl: string; apiKeyEncrypted: string | null; timeoutMs?: number }) => Promise<ModelInfo[]>>()
vi.mock('@/services/model/modelGateway', async () => {
  const actual = await vi.importActual<typeof import('@/services/model/modelGateway')>(
    '@/services/model/modelGateway',
  )
  return {
    ...actual,
    callOpenAICompatible: (...args: unknown[]) => callOpenAICompatibleMock(...args),
    testConnection: vi.fn(async () => ({ ok: true, message: '连接成功' })),
    listModels: listModelsMock,
  }
})

// 延迟导入，确保 mock 已注册
const {
  createProvider,
  upsertConfig,
  getConfigByTask,
  getEnabledProvider,
  callModel,
  callModelDirect,
  listProviders,
} = await import('./ModelService')

// ============ 测试工具 ============

/// 解包 ServiceResult，断言成功并返回 data（类型安全，避免 TS 判别联合 narrowing 问题）
function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

/// 解包 ServiceResult，断言失败并返回 error
function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) {
    throw new Error(`Expected error result but got ok: ${JSON.stringify(result.data)}`)
  }
  return result.error
}

// ============ 测试夹具 ============

const DEFAULT_WORKSPACE_ID = 'default_workspace'

/// 初始化工作空间夹具（ModelService 所有查询都依赖默认工作空间）
function seedWorkspace() {
  seedTable('workspaces', [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: '默认工作空间',
      created_by: 'default_user',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
  seedTable('users', [
    {
      id: 'default_user',
      display_name: '默认用户',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
}

/// 通过 Service 层创建一个服务商（模拟用户在设置页配置）
async function seedProvider(name: string = '测试服务商') {
  const result = await createProvider({
    name,
    type: 'openai_compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test-key-12345678',
    defaultModelName: 'gpt-4',
    defaultModelContextLength: 8192,
  })
  return unwrap(result)
}

beforeEach(() => {
  vi.clearAllMocks()
  // listModels 默认返回空数组（不存在的模型会回退到内置 fallback 表）
  listModelsMock.mockResolvedValue([])
  seedWorkspace()
})

// ============ 测试用例 ============

describe('ModelService 模型配置联动（待优化项 #1）', () => {
  describe('createProvider：新建服务商默认启用', () => {
    it('新建服务商后 enabled 为 true（默认启用）', async () => {
      const provider = await seedProvider()

      expect(provider.enabled).toBe(true)
      expect(provider.connectionStatus).toBe('untested')
      expect(provider.apiKeyMasked).toContain('****')
      expect(provider.apiKeyEncrypted).toBe('encrypted:sk-test-key-12345678')
    })

    it('listProviders 能查到已创建的服务商', async () => {
      await seedProvider('服务商A')

      const providers = unwrap(await listProviders())
      expect(providers).toHaveLength(1)
      expect(providers[0]!.name).toBe('服务商A')
      expect(providers[0]!.enabled).toBe(true)
    })
  })

  describe('upsertConfig：任务模型配置绑定', () => {
    it('为 chat 任务创建配置后，getConfigByTask 能查到', async () => {
      const provider = await seedProvider()

      unwrap(await upsertConfig({
        taskType: 'chat',
        providerId: provider.id,
        modelName: 'gpt-4',
        temperature: 0.7,
        maxOutputTokens: 4096,
      }))

      const config = unwrap(await getConfigByTask('chat'))
      expect(config).not.toBeNull()
      expect(config!.providerId).toBe(provider.id)
      expect(config!.modelName).toBe('gpt-4')
      expect(config!.enabled).toBe(true)
    })

    it('同一任务类型重复 upsert 为更新而非新增', async () => {
      const provider = await seedProvider()
      unwrap(await upsertConfig({
        taskType: 'rewrite',
        providerId: provider.id,
        modelName: 'gpt-4',
      }))
      unwrap(await upsertConfig({
        taskType: 'rewrite',
        providerId: provider.id,
        modelName: 'gpt-4-turbo',
      }))

      const config = unwrap(await getConfigByTask('rewrite'))
      expect(config).not.toBeNull()
      expect(config!.modelName).toBe('gpt-4-turbo')
    })
  })

  describe('getConfigByTask：未配置时的回退', () => {
    it('未配置任何服务商时，getConfigByTask 返回 null', async () => {
      const config = unwrap(await getConfigByTask('chat'))
      expect(config).toBeNull()
    })

    it('已配置服务商但未绑定任务时，getConfigByTask 返回 null', async () => {
      await seedProvider()

      const config = unwrap(await getConfigByTask('chat'))
      expect(config).toBeNull()
    })
  })

  describe('getEnabledProvider：回退查询启用服务商', () => {
    it('无服务商时返回 null', async () => {
      const provider = unwrap(await getEnabledProvider())
      expect(provider).toBeNull()
    })

    it('有启用的服务商时返回该服务商', async () => {
      await seedProvider('启用服务商')

      const provider = unwrap(await getEnabledProvider())
      expect(provider).not.toBeNull()
      expect(provider!.name).toBe('启用服务商')
      expect(provider!.enabled).toBe(true)
    })
  })

  describe('callModel：已配置任务模型时走配置链路', () => {
    it('有任务模型配置时，callModel 使用配置的 provider 调用模型', async () => {
      const provider = await seedProvider()
      unwrap(await upsertConfig({
        taskType: 'chat',
        providerId: provider.id,
        modelName: 'gpt-4',
      }))

      const config = unwrap(await getConfigByTask('chat'))!
      callOpenAICompatibleMock.mockResolvedValueOnce({
        content: '模型回复内容',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        modelName: 'gpt-4',
      })

      const result = unwrap(await callModel({
        modelConfigId: config.id,
        messages: [{ role: 'user', content: '你好' }],
      }))

      expect(callOpenAICompatibleMock).toHaveBeenCalledTimes(1)
      const callArgs = callOpenAICompatibleMock.mock.calls[0][0]
      expect(callArgs.baseUrl).toBe('https://api.example.com/v1')
      expect(callArgs.modelName).toBe('gpt-4')
      expect(callArgs.apiKeyEncrypted).toBe('encrypted:sk-test-key-12345678')
      expect(result.content).toBe('模型回复内容')
    })
  })

  describe('callModelDirect：未配置任务模型时的回退链路', () => {
    it('provider 启用时，callModelDirect 正常调用', async () => {
      const provider = await seedProvider()
      callOpenAICompatibleMock.mockResolvedValueOnce({
        content: '回退调用回复',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        modelName: 'gpt-4',
      })

      const result = unwrap(await callModelDirect({
        provider,
        modelName: provider.defaultModelName,
        messages: [{ role: 'user', content: '你好' }],
      }))

      expect(callOpenAICompatibleMock).toHaveBeenCalledTimes(1)
      expect(result.content).toBe('回退调用回复')
    })

    it('provider 被禁用时，callModelDirect 返回 MODEL_NOT_CONFIGURED', async () => {
      const provider = await seedProvider()
      const { updateProvider } = await import('./ModelService')
      unwrap(await updateProvider({
        providerId: provider.id,
        patch: { enabled: false },
      }))

      const providers = unwrap(await listProviders())
      const disabled = providers[0]!
      const error = unwrapErr(await callModelDirect({
        provider: disabled,
        modelName: disabled.defaultModelName,
        messages: [{ role: 'user', content: '你好' }],
      }))

      expect(error.code).toBe('MODEL_NOT_CONFIGURED')
      expect(callOpenAICompatibleMock).not.toHaveBeenCalled()
    })
  })

  describe('完整联动链路：模拟用户配置 → Agent 调用', () => {
    it('场景A：配置服务商 + 绑定任务 → callModel 成功', async () => {
      // 1. 用户创建服务商
      const provider = await seedProvider()
      // 2. 用户绑定 chat 任务
      unwrap(await upsertConfig({
        taskType: 'chat',
        providerId: provider.id,
        modelName: 'gpt-4',
      }))
      // 3. 查询配置
      const config = unwrap(await getConfigByTask('chat'))!
      expect(config).not.toBeNull()
      // 4. 调用模型
      callOpenAICompatibleMock.mockResolvedValueOnce({
        content: '回复',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        modelName: 'gpt-4',
      })
      const result = unwrap(await callModel({
        modelConfigId: config.id,
        messages: [{ role: 'user', content: '写一句话' }],
      }))
      expect(result.content).toBe('回复')
    })

    it('场景B：配置服务商但未绑定任务 → getEnabledProvider 回退成功', async () => {
      // 1. 用户创建服务商但未绑定任务
      const provider = await seedProvider()
      // 2. getConfigByTask 返回 null
      const config = unwrap(await getConfigByTask('chat'))
      expect(config).toBeNull()
      // 3. 回退到 getEnabledProvider
      const fallback = unwrap(await getEnabledProvider())!
      expect(fallback).not.toBeNull()
      expect(fallback.id).toBe(provider.id)
      // 4. callModelDirect 可正常调用
      callOpenAICompatibleMock.mockResolvedValueOnce({
        content: '回退回复',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        modelName: 'gpt-4',
      })
      const result = unwrap(await callModelDirect({
        provider: fallback,
        modelName: fallback.defaultModelName,
        messages: [{ role: 'user', content: '写一句话' }],
      }))
      expect(result.content).toBe('回退回复')
    })

    it('场景C：未配置任何服务商 → getEnabledProvider 返回 null（应报错）', async () => {
      const config = unwrap(await getConfigByTask('chat'))
      expect(config).toBeNull()

      const fallback = unwrap(await getEnabledProvider())
      expect(fallback).toBeNull()
      // AgentService.sendMessage 在此场景应返回 MODEL_NOT_CONFIGURED
      // （此处仅验证 ModelService 层返回 null，由上层 AgentService 判定报错）
    })
  })
})

// ============ 阶段 3：max token 自动查模型能力（待优化项 #8） ============

describe('ModelService max token 自动查模型能力（待优化项 #8）', () => {
  it('upsertConfig 未传 maxOutputTokens 时，从远程 /v1/models 查到模型实际值', async () => {
    const provider = await seedProvider()
    // mock listModels 返回 gpt-4o 的 maxOutputTokens=16384
    listModelsMock.mockResolvedValueOnce([
      { id: 'gpt-4o', contextLength: 128000, maxOutputTokens: 16384 },
    ])

    const result = unwrap(await upsertConfig({
      providerId: provider.id,
      taskType: 'chat',
      modelName: 'gpt-4o',
      // 故意不传 maxOutputTokens
    }))

    expect(result.maxOutputTokens).toBe(16384)
    expect(result.modelName).toBe('gpt-4o')
  })

  it('远程查询失败时，回退查内置 fallback 表得 maxOutputTokens', async () => {
    const provider = await seedProvider()
    // mock listModels 抛错（模拟网络失败）
    listModelsMock.mockRejectedValueOnce(new Error('network error'))

    const result = unwrap(await upsertConfig({
      providerId: provider.id,
      taskType: 'chat',
      modelName: 'deepseek-chat',  // 内置 fallback 表有：8192
    }))

    expect(result.maxOutputTokens).toBe(8192)
  })

  it('远程返回空列表且 fallback 表也无该模型时，回退 4096', async () => {
    const provider = await seedProvider()
    listModelsMock.mockResolvedValueOnce([])

    const result = unwrap(await upsertConfig({
      providerId: provider.id,
      taskType: 'chat',
      modelName: 'unknown-model-xyz',
    }))

    expect(result.maxOutputTokens).toBe(4096)
  })

  it('用户显式传 maxOutputTokens 时优先用用户值，不查远程', async () => {
    const provider = await seedProvider()
    // listModels 不配置返回值，若被调用会返回默认空数组
    // 但因用户显式传值，resolveMaxOutputTokens 不应被触发

    const result = unwrap(await upsertConfig({
      providerId: provider.id,
      taskType: 'chat',
      modelName: 'gpt-4o',
      maxOutputTokens: 2048,  // 用户显式指定
    }))

    expect(result.maxOutputTokens).toBe(2048)
    // listModels 不应被调用
    expect(listModelsMock).not.toHaveBeenCalled()
  })

  it('远程列表中无目标模型时，回退查 fallback 表', async () => {
    const provider = await seedProvider()
    // 远程返回其他模型，不含 gpt-4o
    listModelsMock.mockResolvedValueOnce([
      { id: 'gpt-3.5-turbo', contextLength: 16385, maxOutputTokens: 4096 },
    ])

    const result = unwrap(await upsertConfig({
      providerId: provider.id,
      taskType: 'chat',
      modelName: 'gpt-4o',  // fallback 表有：16384
    }))

    expect(result.maxOutputTokens).toBe(16384)
  })
})
