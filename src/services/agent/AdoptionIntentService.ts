// Agent 采纳目标推断 Service
// 负责根据任务类型、用户原始指令与助手回复结构，判断采纳后应写入哪里。

import type { AgentTaskType } from '@/types'

/// 采纳目标
/// - document：插入当前文档
/// - outline：批量创建大纲节点
/// - card：创建卡片
/// - knowledge：创建知识
export type AdoptDestination = 'document' | 'outline' | 'card' | 'knowledge'

export type InferAdoptDestinationInput = {
  content: string
  taskType: AgentTaskType
  userInstruction?: string | null
}

/// 根据任务类型、用户指令与 AI 回复内容推断最合适的采纳目标。
///
/// 规则：
/// 1. 快捷任务的明确意图优先：生成卡片/大纲、检查来源等保持原有行为。
/// 2. 自由问答中，用户明确要求写正文/续写/编写章节时，优先采纳到文档。
/// 3. 用户明确要求大纲/提纲/结构规划时，才优先采纳到大纲。
/// 4. 其余自由问答再按回复结构判断：大纲、知识、卡片、文档。
export function inferAdoptDestination(
  input: InferAdoptDestinationInput,
): AdoptDestination {
  const { content, taskType, userInstruction } = input

  switch (taskType) {
    case 'generate_card':
      return 'card'
    case 'generate_outline':
      return 'outline'
    case 'check_source':
      return 'knowledge'
    case 'rewrite':
    case 'expand':
    case 'summarize':
    case 'format_text':
      return 'document'
  }

  if (hasExplicitOutlineIntent(userInstruction)) {
    return 'outline'
  }

  if (hasDocumentWritingIntent(userInstruction)) {
    return 'document'
  }

  const trimmed = content.trim()

  if (hasOutlineStructure(trimmed)) {
    return 'outline'
  }

  if (isKnowledgeLike(trimmed)) {
    return 'knowledge'
  }

  if (isCardLike(trimmed)) {
    return 'card'
  }

  return 'document'
}

function hasExplicitOutlineIntent(instruction?: string | null): boolean {
  if (!instruction) return false
  return /(?:大纲|提纲|目录|结构|章节规划|分层|框架|写作目标)/.test(instruction)
}

function hasDocumentWritingIntent(instruction?: string | null): boolean {
  if (!instruction) return false

  return /(?:正文|成文|初稿|草稿|编写|撰写|写作|续写|创作|补写|扩写|完成.*(?:卷|章|节|集|篇|幕)|写一[段篇章节集]|生成.*(?:正文|初稿|草稿))/.test(
    instruction,
  )
}

function hasOutlineStructure(content: string): boolean {
  return (
    /^#{1,6}\s+/m.test(content) ||
    /^(\d+\.|[一二三四五六七八九十]+、|[\u2460-\u2473])\s+\S/m.test(content)
  )
}

function isKnowledgeLike(content: string): boolean {
  return (
    /(?:规则|定义|结论|注意|必须|禁止|原理|设定|事实|背景)/.test(content) &&
    content.length < 800
  )
}

function isCardLike(content: string): boolean {
  return content.length < 150 && !/\n{2,}/.test(content) && /[：:]/.test(content)
}
