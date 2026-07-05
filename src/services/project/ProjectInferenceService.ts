// 项目从文档推断 Service
// 对应任务:项目从外部文档导入
//
// 职责:
// - 基于外部文档的纯文本,调用模型推断项目元数据
// - 返回结构化的 InferredProjectMeta,供 UI 回填表单
//
// 架构约束:
// - 项目尚未创建时不经过 AgentThread / ContextPack 流程,直接调用模型
//   (与 ProjectOnboardingService 一致,符合 AGENTS.md §10)
// - 不直接访问数据库/文件系统/UI

import type { ServiceResult } from '@/types/service'
import { ok, err } from '@/types/service'
import { PROJECT_INFERENCE_FAILED } from '@/constants/errors'
import type { InferredProjectMeta } from '@/types/projectImport'
import {
  callModelForInference,
  safeParseJson,
  normalizeProjectType,
} from './projectInferenceUtils'

// ============ 内部常量 ============

/// 文档纯文本截取上限(避免上下文超限)
/// 超出部分不影响元数据推断质量
const PLAIN_TEXT_EXCERPT_LIMIT = 4000

// ============ 对外方法 ============

/// 基于文档纯文本推断项目元数据
///
/// @param plainText 文档全文纯文本(由 Rust 端 StructuredDoc.plainText 提供)
/// @returns InferredProjectMeta,UI 回填表单后用户可编辑
export async function inferProjectFromDocument(
  plainText: string,
): Promise<ServiceResult<InferredProjectMeta>> {
  const trimmed = plainText.trim()
  if (trimmed.length === 0) {
    return err({
      code: PROJECT_INFERENCE_FAILED,
      message: '文档内容为空,无法推断项目信息',
      retryable: false,
    })
  }

  const excerpt = trimmed.slice(0, PLAIN_TEXT_EXCERPT_LIMIT)

  const systemPrompt = `你是一位写作项目规划助手。请根据用户提供的文档内容,推断一个写作项目的元数据,返回 JSON:
{
  "name": "项目名称(简洁,不超过 30 字,从文档主标题或核心主题提炼)",
  "type": "项目类型,只能是 research(研究/论文)、fiction(小说/长文)、free_writing(自由写作)之一",
  "description": "项目描述(50-100 字,概括文档主题)",
  "writingGoal": "写作目标(50 字以内)",
  "targetReader": "目标读者(30 字以内)",
  "targetWordCount": 数字(1000-100000 之间的整数)
}
只返回 JSON,不要解释。`

  const result = await callModelForInference(systemPrompt, excerpt)
  if (!result.ok) return err(result.error)

  const parsed = safeParseJson<{
    name?: string
    type?: string
    description?: string
    writingGoal?: string
    targetReader?: string
    targetWordCount?: number
  }>(result.data)

  if (!parsed || !parsed.name) {
    return err({
      code: PROJECT_INFERENCE_FAILED,
      message: 'AI 推断结果解析失败,请重试或手动填写',
      retryable: true,
    })
  }

  const wordCount = Number(parsed.targetWordCount)
  return ok({
    name: parsed.name.slice(0, 30),
    type: normalizeProjectType(parsed.type ?? 'free_writing'),
    description: (parsed.description ?? '').slice(0, 500),
    writingGoal: (parsed.writingGoal ?? '').slice(0, 200),
    targetReader: (parsed.targetReader ?? '').slice(0, 100),
    targetWordCount: Number.isFinite(wordCount)
      ? Math.max(1000, Math.min(100000, Math.floor(wordCount)))
      : 5000,
  })
}
