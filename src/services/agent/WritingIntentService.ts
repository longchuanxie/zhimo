import type { Document, EntityId, OutlineNode } from '@/types'
import type { ServiceResult } from '@/types/service'
import { err, ok, fromUnknown } from '@/types/service'
import { getDocument, listDocuments } from '@/services/document/DocumentService'
import { getOutline } from '@/services/outline/OutlineService'
import {
  findPendingWritingIntentClarification,
  getThreadState,
} from '@/services/agent/AgentThreadStateService'

export type EpisodeWritingIntent = {
  episodeNumber: number
  targetLabel: string
}

export type WritingIntentPreflight =
  | { kind: 'none' }
  | {
      kind: 'clarify'
      intent: EpisodeWritingIntent
      document: Document | null
      message: string
    }
  | {
      kind: 'proceed'
      intent: EpisodeWritingIntent
      mode:
        | 'create_document'
        | 'append_empty_document'
        | 'append_existing_document'
        | 'replace_existing_document'
      outlineNode: OutlineNode
      document: Document | null
      instructionAddon: string
    }

export async function analyzeEpisodeWritingIntent(input: {
  projectId: EntityId
  instruction: string
  threadId?: EntityId
}): Promise<ServiceResult<WritingIntentPreflight>> {
  try {
    const intent = parseEpisodeWritingIntent(input.instruction)
    if (!intent) {
      if (!input.threadId) return ok({ kind: 'none' })
      return resolvePendingWritingIntentFollowup({
        projectId: input.projectId,
        threadId: input.threadId,
        instruction: input.instruction,
      })
    }

    const outlineResult = await getOutline(input.projectId)
    if (!outlineResult.ok) return err(outlineResult.error)

    const documentsResult = await listDocuments(input.projectId)
    if (!documentsResult.ok) return err(documentsResult.error)

    const outlineNode = findTargetOutlineNode(outlineResult.data.nodes, intent)
    if (!outlineNode) {
      return ok({
        kind: 'clarify',
        intent,
        document: null,
        message: `我没有在当前大纲中找到${intent.targetLabel}对应的节点。请先创建${intent.targetLabel}的大纲，或告诉我要基于哪个已有大纲节点来写正文。`,
      })
    }

    const document = findDocumentForTarget(documentsResult.data, outlineNode, intent)
    if (document && hasDocumentContent(document)) {
      return ok({
        kind: 'clarify',
        intent,
        document,
        message: buildClarificationMessage(intent, document),
      })
    }

    return ok({
      kind: 'proceed',
      intent,
      mode: document ? 'append_empty_document' : 'create_document',
      outlineNode,
      document: document ?? null,
      instructionAddon: buildInstructionAddon({
        intent,
        outlineNode,
        document: document ?? null,
        mode: document ? 'append_empty_document' : 'create_document',
      }),
    })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

async function resolvePendingWritingIntentFollowup(input: {
  projectId: EntityId
  threadId: EntityId
  instruction: string
}): Promise<ServiceResult<WritingIntentPreflight>> {
  const decision = parseClarificationDecision(input.instruction)
  if (!decision) return ok({ kind: 'none' })

  const stateResult = await getThreadState(input.threadId)
  if (!stateResult.ok) return err(stateResult.error)

  const pending = findPendingWritingIntentClarification(stateResult.data)
  if (!pending) return ok({ kind: 'none' })

  if (decision === 'polish') {
    return ok({
      kind: 'clarify',
      intent: parseTargetLabelAsIntent(pending.targetLabel),
      document: pending.documentId
        ? await readDocumentOrNull(pending.documentId)
        : null,
      message: '润色/扩写会影响已有正文，请先打开目标文档并选择要润色的具体文本，或回复“继续写 / 重写”。',
    })
  }

  if (!pending.documentId) {
    return ok({
      kind: 'clarify',
      intent: parseTargetLabelAsIntent(pending.targetLabel),
      document: null,
      message: `我找不到${pending.targetLabel}对应的文档，请重新说明要基于哪个文档继续写。`,
    })
  }

  const documentResult = await getDocument(pending.documentId)
  if (!documentResult.ok) return err(documentResult.error)

  const outlineResult = await getOutline(input.projectId)
  if (!outlineResult.ok) return err(outlineResult.error)

  const outlineNode =
    findOutlineNodeById(outlineResult.data.nodes, pending.outlineNodeId) ??
    findDocumentOutlineNode(outlineResult.data.nodes, documentResult.data)

  if (!outlineNode) {
    return ok({
      kind: 'clarify',
      intent: parseTargetLabelAsIntent(pending.targetLabel),
      document: documentResult.data,
      message: `我找到了文档《${documentResult.data.title}》，但没有找到对应的大纲节点。请告诉我要基于哪个大纲节点继续写。`,
    })
  }

  const intent = parseTargetLabelAsIntent(pending.targetLabel)
  return ok({
    kind: 'proceed',
    intent,
    mode: decision === 'rewrite'
      ? 'replace_existing_document'
      : 'append_existing_document',
    outlineNode,
    document: documentResult.data,
    instructionAddon: buildInstructionAddon({
      intent,
      outlineNode,
      document: documentResult.data,
      mode: decision === 'rewrite'
        ? 'replace_existing_document'
        : 'append_existing_document',
    }),
  })
}

export function parseEpisodeWritingIntent(
  instruction: string,
): EpisodeWritingIntent | null {
  const normalized = instruction.replace(/\s+/g, '')
  const hasWritingVerb = /(完成|编写|写作|撰写|生成|创作|起草)/.test(normalized)
  const asksBody = /(正文|内容|章节|集)/.test(normalized)
  if (!hasWritingVerb || !asksBody) return null

  const match = normalized.match(/第([0-9零〇一二两三四五六七八九十百]+)(集|章|节)/)
  if (!match) return null

  const episodeNumber = parseChineseNumber(match[1]!)
  if (!episodeNumber || episodeNumber < 1) return null

  return {
    episodeNumber,
    targetLabel: `第${episodeNumber}集`,
  }
}

function findTargetOutlineNode(
  nodes: OutlineNode[],
  intent: EpisodeWritingIntent,
): OutlineNode | null {
  const patterns = buildTargetPatterns(intent)
  return (
    nodes.find((node) => matchesTarget(node.title, patterns)) ??
    nodes.find((node) => matchesTarget(node.description ?? '', patterns)) ??
    null
  )
}

function findDocumentForTarget(
  documents: Document[],
  outlineNode: OutlineNode,
  intent: EpisodeWritingIntent,
): Document | null {
  const linked = documents.find(
    (doc) =>
      doc.outlineNodeId === outlineNode.id ||
      doc.id === outlineNode.linkedDocumentId,
  )
  if (linked) return linked

  const patterns = buildTargetPatterns(intent)
  return documents.find((doc) => matchesTarget(doc.title, patterns)) ?? null
}

function findOutlineNodeById(
  nodes: OutlineNode[],
  nodeId: EntityId | null,
): OutlineNode | null {
  if (!nodeId) return null
  return nodes.find((node) => node.id === nodeId) ?? null
}

function findDocumentOutlineNode(
  nodes: OutlineNode[],
  document: Document,
): OutlineNode | null {
  return (
    nodes.find((node) => node.id === document.outlineNodeId) ??
    nodes.find((node) => node.linkedDocumentId === document.id) ??
    null
  )
}

function matchesTarget(text: string, patterns: string[]): boolean {
  const normalized = normalizeTargetText(text)
  return patterns.some((pattern) => normalized.includes(pattern))
}

function buildTargetPatterns(intent: EpisodeWritingIntent): string[] {
  const arabic = normalizeTargetText(`第${intent.episodeNumber}集`)
  const chinese = normalizeTargetText(`第${toChineseNumber(intent.episodeNumber)}集`)
  return [...new Set([arabic, chinese])]
}

function normalizeTargetText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[：:，,。.!！?？《》「」『』【】[\]()（）_-]/g, '')
}

function hasDocumentContent(document: Document): boolean {
  return document.wordCount > 0 || document.plainText.trim().length > 0
}

function buildClarificationMessage(
  intent: EpisodeWritingIntent,
  document: Document,
): string {
  return `我找到了${intent.targetLabel}对应的文档《${document.title}》，目前已有 ${document.wordCount} 字正文。为了避免误覆盖已有内容，请确认你的真实意图：\n\n1. 继续在现有正文后续写${intent.targetLabel}\n2. 重写并替换现有正文\n3. 基于现有正文润色/扩写\n\n请回复其中一种处理方式，我再继续。`
}

function parseClarificationDecision(
  instruction: string,
): 'continue' | 'rewrite' | 'polish' | null {
  const normalized = instruction.replace(/\s+/g, '')
  if (/^(1|一|第一种|按第一种|选第一种|继续|继续写|续写|接着写|往后写)$/.test(normalized)) {
    return 'continue'
  }
  if (/^(2|二|第二种|按第二种|选第二种|重写|重新写|替换)$/.test(normalized)) {
    return 'rewrite'
  }
  if (/^(3|三|第三种|按第三种|选第三种|润色|扩写|润色扩写)$/.test(normalized)) {
    return 'polish'
  }
  return null
}

function parseTargetLabelAsIntent(targetLabel: string): EpisodeWritingIntent {
  const match = targetLabel.match(/第(\d+)集/)
  const episodeNumber = match ? Number(match[1]) : 1
  return {
    episodeNumber,
    targetLabel,
  }
}

async function readDocumentOrNull(documentId: EntityId): Promise<Document | null> {
  const result = await getDocument(documentId)
  return result.ok ? result.data : null
}

function buildInstructionAddon(input: {
  intent: EpisodeWritingIntent
  outlineNode: OutlineNode
  document: Document | null
  mode:
    | 'create_document'
    | 'append_empty_document'
    | 'append_existing_document'
    | 'replace_existing_document'
}): string {
  const outlineText = [
    `标题：${input.outlineNode.title}`,
    input.outlineNode.description ? `大纲说明：${input.outlineNode.description}` : null,
    input.outlineNode.targetWordCount > 0
      ? `目标字数：${input.outlineNode.targetWordCount} 字`
      : null,
  ].filter(Boolean).join('\n')

  if (input.document && input.mode === 'append_existing_document') {
    return [
      '【写作意图预检】',
      `用户已确认选择继续在现有正文后续写${input.intent.targetLabel}。`,
      `目标文档：${input.document.title}（documentId=${input.document.id}），当前已有 ${input.document.wordCount} 字。`,
      '请根据下方大纲和现有正文语境生成后续正文，不要重写或覆盖已有正文，不要只输出大纲或写作建议。',
      '生成正文后必须调用 append_document_content 工具，将新生成的后续正文追加到该文档末尾。',
      `工具参数必须包含：documentId="${input.document.id}"，mode="append"。`,
      '【对应大纲】',
      outlineText,
      '【已有正文摘要】',
      input.document.plainText.slice(-1200),
    ].join('\n')
  }

  if (input.document && input.mode === 'replace_existing_document') {
    return [
      '【写作意图预检】',
      `用户已确认选择重写并替换${input.intent.targetLabel}现有正文。`,
      `目标文档：${input.document.title}（documentId=${input.document.id}），当前已有 ${input.document.wordCount} 字。`,
      '请根据下方大纲重新生成完整正文，不要只输出大纲或写作建议。',
      '生成完整新正文后必须调用 append_document_content 工具，并使用 mode="replace_all"，由用户确认后替换全文。',
      `工具参数必须包含：documentId="${input.document.id}"，mode="replace_all"。`,
      '【对应大纲】',
      outlineText,
      '【原正文参考】',
      input.document.plainText.slice(0, 1200),
    ].join('\n')
  }

  if (input.document) {
    return [
      '【写作意图预检】',
      `用户明确要求完成${input.intent.targetLabel}的正文编写。`,
      `已找到对应空文档：${input.document.title}（documentId=${input.document.id}）。`,
      '请根据下方大纲直接生成完整正文，不要只输出大纲或写作建议。',
      '生成正文后必须调用 append_document_content 工具，将完整正文写入该空文档。',
      `工具参数必须包含：documentId="${input.document.id}"，mode="append"。`,
      '【对应大纲】',
      outlineText,
    ].join('\n')
  }

  return [
    '【写作意图预检】',
    `用户明确要求完成${input.intent.targetLabel}的正文编写。`,
    '当前没有找到对应文档。',
    '请根据下方大纲直接生成完整正文，不要只输出大纲或写作建议。',
    '生成正文后必须调用 create_document 工具创建对应文档，并在 content 参数中放入完整正文。',
    `工具参数必须包含：title="${input.outlineNode.title}"，outlineNodeId="${input.outlineNode.id}"。`,
    '【对应大纲】',
    outlineText,
  ].join('\n')
}

function parseChineseNumber(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw)

  const digits: Record<string, number> = {
    零: 0,
    '〇': 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }

  if (raw === '十') return 10
  const tenIndex = raw.indexOf('十')
  if (tenIndex >= 0) {
    const before = raw.slice(0, tenIndex)
    const after = raw.slice(tenIndex + 1)
    const tens = before ? digits[before] : 1
    const ones = after ? digits[after] : 0
    if (tens === undefined || ones === undefined) return null
    return tens * 10 + ones
  }

  if (raw.length === 1) return digits[raw] ?? null
  return null
}

function toChineseNumber(value: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (value < 10) return digits[value]!
  if (value === 10) return '十'
  if (value < 20) return `十${digits[value - 10]}`
  if (value < 100) {
    const tens = Math.floor(value / 10)
    const ones = value % 10
    return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`
  }
  return String(value)
}
