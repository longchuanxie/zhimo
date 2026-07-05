// ProjectInferenceService 单元测试
// 对应任务:项目从外部文档导入
//
// 覆盖:
// - inferProjectFromDocument 成功路径(模型返回合法 JSON)
// - 模型返回包裹在 ```json``` 代码块的 JSON
// - 模型未配置(getEnabledProvider 返回 null)
// - 文档内容为空
// - 模型返回非 JSON(PROJECT_INFERENCE_FAILED)
// - 模型返回缺少 name 字段
// - 项目类型非法时回退为 free_writing
// - targetWordCount 越界时夹紧到 [1000, 100000]
// - targetWordCount 非数字时回退为 5000

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ServiceResult } from '@/types/service'
import type { ModelProvider, ModelResult } from '@/types'

// ============ mock ModelService ============
const callModelDirectMock = vi.fn<() => Promise<ServiceResult<ModelResult>>>()
const getEnabledProviderMock = vi.fn<() => Promise<ServiceResult<ModelProvider | null>>>()

vi.mock('@/services/model/ModelService', async () => {
  const actual = await vi.importActual<typeof import('@/services/model/ModelService')>('@/services/model/ModelService')
  return {
    ...actual,
    callModelDirect: callModelDirectMock,
    getEnabledProvider: getEnabledProviderMock,
  }
})

// 延迟导入,确保 mock 已注册
const { inferProjectFromDocument } = await import('./ProjectInferenceService')

// ============ 测试工具 ============

function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) {
    throw new Error(`Expected error result but got ok: ${JSON.stringify(result.data)}`)
  }
  return result.error
}

/// 构造一个启用的 provider 夹具
function makeProvider(): ModelProvider {
  return {
    id: 'prov-1',
    name: '测试服务商',
    providerType: 'openai',
    baseUrl: 'http://localhost',
    apiKeyEncrypted: 'enc:test',
    enabled: true,
    defaultModelName: 'test-model',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  } as unknown as ModelProvider
}

/// 配置 getEnabledProvider 返回启用的 provider
function mockProviderEnabled() {
  getEnabledProviderMock.mockResolvedValue({
    ok: true,
    data: makeProvider(),
  })
}

/// 配置 callModelDirect 返回指定 content
function mockModelContent(content: string) {
  callModelDirectMock.mockResolvedValue({
    ok: true,
    data: { content } as unknown as ModelResult,
  })
}

beforeEach(() => {
  callModelDirectMock.mockReset()
  getEnabledProviderMock.mockReset()
})

describe('inferProjectFromDocument', () => {
  it('成功路径:模型返回合法 JSON 时返回 InferredProjectMeta', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({
      name: '人工智能伦理研究',
      type: 'research',
      description: '探讨人工智能发展中的伦理问题',
      writingGoal: '完成一篇学术论文',
      targetReader: '学术评审',
      targetWordCount: 8000,
    }))

    const result = await inferProjectFromDocument('这是一篇关于人工智能伦理的文档内容...')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe('人工智能伦理研究')
      expect(result.data.type).toBe('research')
      expect(result.data.targetWordCount).toBe(8000)
    }
  })

  it('模型返回包裹在 ```json``` 代码块的 JSON 也能解析', async () => {
    mockProviderEnabled()
    const json = JSON.stringify({
      name: '小说项目',
      type: 'fiction',
      description: '一部长篇小说',
      writingGoal: '完成创作',
      targetReader: '大众读者',
      targetWordCount: 50000,
    })
    mockModelContent('```json\n' + json + '\n```')

    const result = await inferProjectFromDocument('小说正文内容...')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe('小说项目')
      expect(result.data.type).toBe('fiction')
    }
  })

  it('模型未配置时返回 MODEL_NOT_CONFIGURED', async () => {
    getEnabledProviderMock.mockResolvedValue({ ok: true, data: null })

    const error = unwrapErr(await inferProjectFromDocument('文档内容'))

    expect(error.code).toBe('MODEL_NOT_CONFIGURED')
  })

  it('文档内容为空时返回 PROJECT_INFERENCE_FAILED', async () => {
    const error = unwrapErr(await inferProjectFromDocument('   '))

    expect(error.code).toBe('PROJECT_INFERENCE_FAILED')
    expect(error.retryable).toBe(false)
    // 不应调用模型
    expect(callModelDirectMock).not.toHaveBeenCalled()
  })

  it('模型返回非 JSON 时返回 PROJECT_INFERENCE_FAILED', async () => {
    mockProviderEnabled()
    mockModelContent('这不是 JSON,只是普通文本')

    const error = unwrapErr(await inferProjectFromDocument('文档内容'))

    expect(error.code).toBe('PROJECT_INFERENCE_FAILED')
    expect(error.retryable).toBe(true)
  })

  it('模型返回缺少 name 字段时返回 PROJECT_INFERENCE_FAILED', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({ type: 'research' }))

    const error = unwrapErr(await inferProjectFromDocument('文档内容'))

    expect(error.code).toBe('PROJECT_INFERENCE_FAILED')
  })

  it('项目类型非法时回退为 free_writing', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({
      name: '项目',
      type: 'invalid_type',
      description: '描述',
      writingGoal: '目标',
      targetReader: '读者',
      targetWordCount: 5000,
    }))

    const result = await inferProjectFromDocument('文档内容')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.type).toBe('free_writing')
    }
  })

  it('targetWordCount 超过上限时夹紧为 100000', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({
      name: '项目',
      type: 'fiction',
      description: '描述',
      writingGoal: '目标',
      targetReader: '读者',
      targetWordCount: 999999,
    }))

    const result = await inferProjectFromDocument('文档内容')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.targetWordCount).toBe(100000)
    }
  })

  it('targetWordCount 低于下限时夹紧为 1000', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({
      name: '项目',
      type: 'fiction',
      description: '描述',
      writingGoal: '目标',
      targetReader: '读者',
      targetWordCount: 100,
    }))

    const result = await inferProjectFromDocument('文档内容')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.targetWordCount).toBe(1000)
    }
  })

  it('targetWordCount 为非数字时回退为 5000', async () => {
    mockProviderEnabled()
    mockModelContent(JSON.stringify({
      name: '项目',
      type: 'fiction',
      description: '描述',
      writingGoal: '目标',
      targetReader: '读者',
      targetWordCount: 'abc',
    }))

    const result = await inferProjectFromDocument('文档内容')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.targetWordCount).toBe(5000)
    }
  })

  it('callModelDirect 失败时透传错误', async () => {
    mockProviderEnabled()
    callModelDirectMock.mockResolvedValue({
      ok: false,
      error: { code: 'MODEL_TIMEOUT', message: '超时', retryable: true },
    })

    const error = unwrapErr(await inferProjectFromDocument('文档内容'))

    expect(error.code).toBe('MODEL_TIMEOUT')
  })
})
