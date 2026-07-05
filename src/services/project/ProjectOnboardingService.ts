// 项目 AI 引导创建 Service
// 职责：
// - 根据用户的一句话描述，调用 Agent 推断项目初始配置
// - 分节点引导用户完善项目字段（类型、名称、目标读者、写作目标、字数、风格规则、禁止规则）
// - 将模型返回解析为结构化的 DraftProject
//
// 注意：项目尚未创建时不经过 AgentThread / ContextPack 流程，直接调用模型。

import type { ProjectType } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err } from '@/types/service'
import {
  callModelForInference,
  safeParseJson,
  normalizeProjectType,
} from './projectInferenceUtils'

// ============ 类型定义 ============

/// 引导节点
export type OnboardingNode =
  | 'description'
  | 'typeAndName'
  | 'targetReader'
  | 'writingGoal'
  | 'wordCount'
  | 'styleRules'
  | 'forbiddenRules'
  | 'confirm'

/// 当前正在被完善的字段
export type OnboardingField =
  | 'description'
  | 'typeAndName'
  | 'targetReader'
  | 'writingGoal'
  | 'wordCount'
  | 'styleRules'
  | 'forbiddenRules'

/// 项目创建草稿
export type DraftProject = {
  name: string
  type: ProjectType
  description: string
  writingGoal: string
  targetReader: string
  targetWordCount: number
  styleRules: string
  forbiddenRules: string
}

/// 一句话描述解析结果
export type InitialParseResult = {
  name: string
  type: ProjectType
  description: string
  suggestedWordCount: number
}

/// 字段完善结果
export type FieldRefineResult = {
  value: string | number
  suggestedNext?: string
}

// ============ 对外方法 ============

/// 根据一句话描述解析项目初始信息
export async function parseInitialDescription(
  description: string,
): Promise<ServiceResult<InitialParseResult>> {
  const systemPrompt = `你是一位写作项目规划助手。请根据用户用一句话描述的项目，解析并返回以下 JSON 字段：
{
  "name": "项目名称（简洁，不超过 30 字）",
  "type": "项目类型，只能是 research（研究/论文）、fiction（小说/长文）、free_writing（自由写作）之一",
  "description": "基于用户描述扩展的项目描述（50-100 字）",
  "suggestedWordCount": "建议目标字数，数字，必须是 1000-100000 之间的整数"
}
只返回 JSON，不要解释。`

  const result = await callModelForInference(systemPrompt, description)
  if (!result.ok) return err(result.error)

  const parsed = safeParseJson<{
    name?: string
    type?: string
    description?: string
    suggestedWordCount?: number
  }>(result.data)

  if (!parsed || !parsed.name) {
    return err({
      code: 'MODEL_OUTPUT_PARSE_FAILED',
      message: '模型返回解析失败，请重试',
      retryable: true,
    })
  }

  return ok({
    name: parsed.name.slice(0, 30),
    type: normalizeProjectType(parsed.type ?? 'free_writing'),
    description: (parsed.description ?? description).slice(0, 500),
    suggestedWordCount: Math.max(1000, Math.min(100000, Number(parsed.suggestedWordCount) || 5000)),
  })
}

/// 根据当前草稿和用户输入，完善指定字段
///
/// 每个字段的模型职责：
/// - 将用户自然语言输入转化为规范、可直接存入数据库的字段值
/// - 当用户仅说"接受"/"好的"时，返回当前建议值
/// - 当用户要求修改时，按用户要求重新生成
export async function refineField(
  field: OnboardingField,
  draft: DraftProject,
  userInput: string,
): Promise<ServiceResult<FieldRefineResult>> {
  const isAcceptance = /^(接受|好的|OK|ok|可以|行|没问题|就这样)$/.test(userInput.trim())

  let systemPrompt = ''
  let currentValue = ''

  switch (field) {
    case 'typeAndName': {
      currentValue = `名称：${draft.name}，类型：${draft.type}`
      systemPrompt = `你是写作项目规划助手。当前项目名称为「${draft.name}」，类型为「${draft.type}」。
用户可能会接受、修改名称或类型。请返回 JSON：
{
  "name": "最终项目名称（不超过 30 字）",
  "type": "最终项目类型，只能是 research / fiction / free_writing 之一",
  "description": "项目描述（50-100 字）"
}
只返回 JSON。`
      break
    }
    case 'targetReader': {
      currentValue = draft.targetReader || '未设置'
      systemPrompt = `你是写作项目规划助手。请根据用户输入，提炼出目标读者描述（30 字以内）。
返回 JSON：{ "value": "目标读者" }
只返回 JSON。`
      break
    }
    case 'writingGoal': {
      currentValue = draft.writingGoal || '未设置'
      systemPrompt = `你是写作项目规划助手。请根据用户输入，提炼出写作目标（50 字以内）。
返回 JSON：{ "value": "写作目标" }
只返回 JSON。`
      break
    }
    case 'wordCount': {
      currentValue = String(draft.targetWordCount)
      systemPrompt = `你是写作项目规划助手。请根据用户输入，返回目标字数（1000-100000 之间的整数）。
如果用户说"接受"/"好的"等，返回当前建议值 ${draft.targetWordCount}。
返回 JSON：{ "value": 数字 }
只返回 JSON。`
      break
    }
    case 'styleRules': {
      currentValue = draft.styleRules || '未设置'
      systemPrompt = `你是写作项目规划助手。请根据用户输入，整理为 1-3 条清晰的写作风格规则（总共不超过 200 字）。
返回 JSON：{ "value": "规则文本" }
只返回 JSON。`
      break
    }
    case 'forbiddenRules': {
      currentValue = draft.forbiddenRules || '未设置'
      systemPrompt = `你是写作项目规划助手。请根据用户输入，整理为 1-3 条禁止规则（总共不超过 200 字）。
返回 JSON：{ "value": "规则文本" }
只返回 JSON。`
      break
    }
    default:
      return err({
        code: 'INVALID_ARGUMENT',
        message: '不支持的引导字段',
        retryable: false,
      })
  }

  if (isAcceptance) {
    switch (field) {
      case 'typeAndName':
        return ok({ value: draft.name })
      case 'targetReader':
        return ok({ value: draft.targetReader || '' })
      case 'writingGoal':
        return ok({ value: draft.writingGoal || '' })
      case 'wordCount':
        return ok({ value: draft.targetWordCount })
      case 'styleRules':
        return ok({ value: draft.styleRules || '' })
      case 'forbiddenRules':
        return ok({ value: draft.forbiddenRules || '' })
    }
  }

  const prompt = `当前值：${currentValue}\n用户输入：${userInput}`
  const result = await callModelForInference(systemPrompt, prompt)
  if (!result.ok) return err(result.error)

  const parsed = safeParseJson<{ value?: string | number; name?: string; type?: string; description?: string }>(
    result.data,
  )

  if (!parsed) {
    return err({
      code: 'MODEL_OUTPUT_PARSE_FAILED',
      message: '模型返回解析失败，请重试',
      retryable: true,
    })
  }

  switch (field) {
    case 'typeAndName': {
      const name = parsed.name?.slice(0, 30) ?? draft.name
      const type = normalizeProjectType(parsed.type ?? draft.type)
      const description = (parsed.description ?? draft.description).slice(0, 500)
      return ok({ value: name, suggestedNext: JSON.stringify({ name, type, description }) })
    }
    case 'wordCount': {
      const num = Number(parsed.value)
      return ok({ value: Number.isFinite(num) ? Math.max(1000, Math.min(100000, num)) : draft.targetWordCount })
    }
    default:
      return ok({ value: String(parsed.value ?? '') })
  }
}

/// 生成最终确认文案
export function buildSummary(draft: DraftProject): string {
  const lines = [
    `**项目名称**：${draft.name}`,
    `**项目类型**：${draft.type === 'research' ? '研究/论文' : draft.type === 'fiction' ? '小说/长文' : '自由写作'}`,
  ]
  if (draft.description) lines.push(`**项目描述**：${draft.description}`)
  if (draft.targetReader) lines.push(`**目标读者**：${draft.targetReader}`)
  if (draft.writingGoal) lines.push(`**写作目标**：${draft.writingGoal}`)
  if (draft.targetWordCount > 0) lines.push(`**目标字数**：${draft.targetWordCount.toLocaleString()} 字`)
  if (draft.styleRules) lines.push(`**风格规则**：${draft.styleRules}`)
  if (draft.forbiddenRules) lines.push(`**禁止规则**：${draft.forbiddenRules}`)

  return lines.join('\n')
}
