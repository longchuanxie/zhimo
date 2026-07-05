// Agent 命令 Service
// 负责将编辑器选区上的用户动作转换为统一命令结果。
//
// 设计目标：
// - UI 组件只提交“用户想做什么”，不直接编排卡片/知识/Agent 动作。
// - AI 类动作返回待派发的 Agent 动作，由 UI 写入 appStore。
// - 本地写入类动作通过对应业务 Service 落地，并统一返回 ServiceResult。

import type { AgentTaskType, BoundObjectType, Card, ContextScope, Knowledge } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR } from '@/constants/errors'
import { createCard } from '@/services/card/CardService'
import { createKnowledge } from '@/services/knowledge/KnowledgeService'

export type SelectionAgentCommand =
  | 'rewrite'
  | 'expand'
  | 'summarize'
  | 'check_source'
  | 'save_as_card'
  | 'save_as_knowledge'

export type PendingAgentActionDraft = {
  taskType: AgentTaskType
  template: string
  boundObjectType?: BoundObjectType
  boundObjectId?: string
  contextScope?: ContextScope
  threadTitle?: string
  autoSubmit?: boolean
}

export type ObjectAgentCommand =
  | 'draft_outline_node'
  | 'extract_cards_from_source'
  | 'check_source_evidence'
  | 'expand_card'
  | 'turn_card_into_knowledge'
  | 'check_knowledge_conflict'
  | 'revise_knowledge'

export type ObjectAgentCommandInput = {
  projectId: string
  command: ObjectAgentCommand
  objectType: BoundObjectType
  objectId: string
  objectTitle: string
}

export type SelectionAgentCommandInput = {
  projectId: string
  command: SelectionAgentCommand
  selectedText: string
}

export type SelectionAgentCommandResult =
  | {
      kind: 'pending_agent_action'
      selectedText: string
      action: PendingAgentActionDraft
    }
  | {
      kind: 'created_card'
      card: Card
    }
  | {
      kind: 'created_knowledge'
      knowledge: Knowledge
    }

const SELECTION_AGENT_ACTIONS: Record<
  Exclude<SelectionAgentCommand, 'save_as_card' | 'save_as_knowledge'>,
  PendingAgentActionDraft
> = {
  rewrite: {
    taskType: 'rewrite',
    template: '请改写当前选区，保留原意并根据项目风格规则调整表达。',
  },
  expand: {
    taskType: 'expand',
    template: '请基于本次参考内容扩展当前文本，保持文档语气，不虚构案例和数据。',
  },
  summarize: {
    taskType: 'summarize',
    template: '请为当前选区生成一段简明摘要。',
  },
  check_source: {
    taskType: 'check_source',
    template: '请检查当前段落是否有缺少来源支撑的判断，并给出可参考的资料或卡片。',
  },
}

export async function executeSelectionAgentCommand(
  input: SelectionAgentCommandInput,
): Promise<ServiceResult<SelectionAgentCommandResult>> {
  try {
    const selectedText = input.selectedText.trim()
    if (!input.projectId.trim()) {
      return err(validationError('项目 ID 不能为空'))
    }
    if (!selectedText) {
      return err(validationError('请先在文档中选择要处理的文本'))
    }

    switch (input.command) {
      case 'rewrite':
      case 'expand':
      case 'summarize':
      case 'check_source':
        return ok({
          kind: 'pending_agent_action',
          selectedText,
          action: SELECTION_AGENT_ACTIONS[input.command],
        })

      case 'save_as_card':
        return createCardFromSelection(input.projectId, selectedText)

      case 'save_as_knowledge':
        return createKnowledgeFromSelection(input.projectId, selectedText)
    }
  } catch (error) {
    return err(fromUnknown(error))
  }
}

export function createObjectAgentAction(
  input: ObjectAgentCommandInput,
): ServiceResult<PendingAgentActionDraft> {
  const projectId = input.projectId.trim()
  const objectId = input.objectId.trim()
  const objectTitle = input.objectTitle.trim()

  if (!projectId) return err(validationError('项目 ID 不能为空'))
  if (!objectId) return err(validationError('对象 ID 不能为空'))
  if (!objectTitle) return err(validationError('对象标题不能为空'))

  const action = buildObjectAction(input.command, objectTitle)
  if (!action) {
    return err(validationError('当前对象不支持此助手动作'))
  }

  return ok({
    ...action,
    boundObjectType: input.objectType,
    boundObjectId: objectId,
    threadTitle: action.threadTitle ?? objectTitle,
    autoSubmit: true,
  })
}

async function createCardFromSelection(
  projectId: string,
  selectedText: string,
): Promise<ServiceResult<SelectionAgentCommandResult>> {
  const title = extractSelectionTitle(selectedText, '选区卡片')
  const result = await createCard({
    projectId,
    title,
    type: 'manual',
    content: selectedText,
    summary: selectedText.slice(0, 100),
    aiUsageAllowed: true,
  })

  if (!result.ok) return err(result.error)
  return ok({ kind: 'created_card', card: result.data })
}

async function createKnowledgeFromSelection(
  projectId: string,
  selectedText: string,
): Promise<ServiceResult<SelectionAgentCommandResult>> {
  const title = extractSelectionTitle(selectedText, '选区知识')
  const result = await createKnowledge({
    projectId,
    title,
    type: 'manual',
    content: selectedText,
    summary: selectedText.slice(0, 100),
    sourceType: 'manual',
    aiUsageAllowed: true,
    confidence: 1.0,
  })

  if (!result.ok) return err(result.error)
  return ok({ kind: 'created_knowledge', knowledge: result.data })
}

function extractSelectionTitle(text: string, fallback: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.slice(0, 50) || fallback
  )
}

function buildObjectAction(
  command: ObjectAgentCommand,
  title: string,
): (PendingAgentActionDraft & { threadTitle: string }) | null {
  switch (command) {
    case 'draft_outline_node':
      return {
        taskType: 'answer_question',
        contextScope: 'current_object',
        threadTitle: `起草：${title}`.slice(0, 20),
        template: [
          `请围绕大纲节点「${title}」起草正文。`,
          '要求：先判断该节点的写作目标、已有资料和关联上下文；如果需要写入正文，请生成待确认操作，不要直接覆盖文档。',
        ].join('\n'),
      }

    case 'extract_cards_from_source':
      return {
        taskType: 'generate_card',
        contextScope: 'current_object',
        threadTitle: `提炼卡片：${title}`.slice(0, 20),
        template: [
          `请从资料「${title}」中提炼结构化卡片。`,
          '要求：优先提炼可复用的论点、事实、概念、案例；每张卡片给出标题、内容摘要和来源说明，并生成待确认操作。',
        ].join('\n'),
      }

    case 'check_source_evidence':
      return {
        taskType: 'check_source',
        contextScope: 'current_object',
        threadTitle: `核查资料：${title}`.slice(0, 20),
        template: [
          `请检查资料「${title}」中可支撑写作的关键证据。`,
          '要求：列出适合引用的观点、数据或案例；指出材料真实性风险和仍需补充的来源。',
        ].join('\n'),
      }

    case 'expand_card':
      return {
        taskType: 'answer_question',
        contextScope: 'current_object',
        threadTitle: `扩展卡片：${title}`.slice(0, 20),
        template: [
          `请扩展卡片「${title}」。`,
          '要求：保留原意，补充可用于正文写作的表达、可能引用的资料方向和不确定点；如需要更新卡片，请生成待确认操作。',
        ].join('\n'),
      }

    case 'turn_card_into_knowledge':
      return {
        taskType: 'answer_question',
        contextScope: 'current_object',
        threadTitle: `转知识：${title}`.slice(0, 20),
        template: [
          `请判断卡片「${title}」是否适合沉淀为知识。`,
          '要求：提炼稳定事实、设定或规则；标注置信度和适用范围；如适合，请生成创建知识的待确认操作。',
        ].join('\n'),
      }

    case 'check_knowledge_conflict':
      return {
        taskType: 'answer_question',
        contextScope: 'related',
        threadTitle: `查冲突：${title}`.slice(0, 20),
        template: [
          `请检查知识「${title}」是否与项目中已有知识、卡片或资料存在冲突。`,
          '要求：只基于可用上下文判断；输出冲突点、证据、处理建议；需要修改时生成待确认操作。',
        ].join('\n'),
      }

    case 'revise_knowledge':
      return {
        taskType: 'answer_question',
        contextScope: 'current_object',
        threadTitle: `修订知识：${title}`.slice(0, 20),
        template: [
          `请基于当前项目上下文修订知识「${title}」。`,
          '要求：保留可靠内容，指出过时/不确定部分，给出新版本建议；需要写入时生成待确认操作。',
        ].join('\n'),
      }
  }
}

function validationError(message: string) {
  return {
    code: VALIDATION_ERROR,
    message,
    retryable: false,
  }
}
