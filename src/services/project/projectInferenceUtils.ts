// 项目元数据推断的公共工具
// 对应技术债 TD-IMPORT-05:抽取 ProjectInferenceService 与 ProjectOnboardingService 的重复实现
//
// 职责:
// - callModelForInference: 包装 callModelDirect,统一模型未配置/超时/异常处理
// - safeParseJson: 兼容 ```json``` 代码块的 JSON 解析
// - normalizeProjectType: 项目类型校验与回退

import type { ProjectType } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { callModelDirect, getEnabledProvider } from '@/services/model/ModelService'
import { ONBOARDING_MODEL_TIMEOUT_MS } from '@/constants/onboarding'
import { MODEL_NOT_CONFIGURED } from '@/constants/errors'

/// 调用模型并返回原始文本响应
///
/// 统一处理:模型未配置/调用失败/异常
/// - temperature: 0.3(适合结构化推断)
/// - maxOutputTokens: 1024(元数据 JSON 足够)
/// - timeoutMs: ONBOARDING_MODEL_TIMEOUT_MS
export async function callModelForInference(
  systemPrompt: string,
  userPrompt: string,
): Promise<ServiceResult<string>> {
  try {
    const providerResult = await getEnabledProvider()
    if (!providerResult.ok) return err(providerResult.error)
    const provider = providerResult.data
    if (!provider) {
      return err({
        code: MODEL_NOT_CONFIGURED,
        message: '请先在设置中配置模型服务商',
        retryable: false,
      })
    }

    const result = await callModelDirect({
      provider,
      modelName: provider.defaultModelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxOutputTokens: 1024,
      timeoutMs: ONBOARDING_MODEL_TIMEOUT_MS,
    })

    if (!result.ok) return err(result.error)
    return ok(result.data.content.trim())
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 安全解析 JSON,失败返回 null
/// 尝试提取 ```json ... ``` 代码块,兼容模型包裹 markdown 的情况
export function safeParseJson<T>(text: string): T | null {
  try {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const clean = codeBlock ? codeBlock[1].trim() : text.trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}

/// 校验项目类型,非法值回退为 free_writing
export function normalizeProjectType(type: string): ProjectType {
  if (type === 'research' || type === 'fiction' || type === 'free_writing') return type
  return 'free_writing'
}
