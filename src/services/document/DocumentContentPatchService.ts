import { VALIDATION_ERROR } from '@/constants/errors'
import type { ServiceResult } from '@/types/service'
import { err, ok } from '@/types/service'

type JsonRecord = Record<string, unknown>

export type TipTapDocumentJson = {
  type: 'doc'
  content: JsonRecord[]
}

export type ApplyDocumentContentPatchInput = {
  contentJson: unknown
  plainText?: string | null
  insertText: string
  mode: string
  selectedText?: string | null
}

export type DocumentContentPatch = {
  contentJson: TipTapDocumentJson
  plainText: string
  wordCount: number
}

export function applyPlainTextPatchToDocumentContent(
  input: ApplyDocumentContentPatchInput,
): ServiceResult<DocumentContentPatch> {
  const existingText = input.plainText ?? ''

  if (input.mode === 'append') {
    const plainText = appendPlainText(existingText, input.insertText)
    const existingDoc = cloneTipTapDoc(input.contentJson)
    const contentJson = existingDoc
      ? appendTextToTipTapDoc(existingDoc, input.insertText)
      : plainTextToTipTapDoc(plainText)

    return ok({
      contentJson,
      plainText,
      wordCount: plainText.length,
    })
  }

  if (input.mode === 'replace_all') {
    const plainText = input.insertText
    return ok({
      contentJson: plainTextToTipTapDoc(plainText),
      plainText,
      wordCount: plainText.length,
    })
  }

  if (input.mode === 'replace_selection') {
    const selectedText = input.selectedText?.trim()
    if (!selectedText) {
      return err(validationError('替换选区需要 selectedText'))
    }

    const index = existingText.indexOf(selectedText)
    if (index < 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '未在当前文档中找到原选区文本，请刷新后重试或改为追加',
        retryable: true,
      })
    }

    const plainText =
      existingText.slice(0, index) +
      input.insertText +
      existingText.slice(index + selectedText.length)

    const existingDoc = cloneTipTapDoc(input.contentJson)
    const contentJson = existingDoc
      ? replaceTextInTipTapDoc(existingDoc, selectedText, input.insertText) ??
        plainTextToTipTapDoc(plainText)
      : plainTextToTipTapDoc(plainText)

    return ok({
      contentJson,
      plainText,
      wordCount: plainText.length,
    })
  }

  return err(validationError(`不支持的正文应用模式：${input.mode}`))
}

export function plainTextToTipTapDoc(text: string): TipTapDocumentJson {
  const content = textToParagraphNodes(text)
  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
  }
}

function appendPlainText(existingText: string, insertText: string): string {
  const separator = existingText.length > 0 ? '\n\n' : ''
  return existingText + separator + insertText
}

function appendTextToTipTapDoc(
  doc: TipTapDocumentJson,
  insertText: string,
): TipTapDocumentJson {
  const appendedNodes = textToParagraphNodes(insertText)
  if (appendedNodes.length === 0) return doc

  if (isEmptyTipTapDoc(doc)) {
    return { ...doc, content: appendedNodes }
  }

  return {
    ...doc,
    content: [...doc.content, ...appendedNodes],
  }
}

function replaceTextInTipTapDoc(
  doc: TipTapDocumentJson,
  selectedText: string,
  insertText: string,
): TipTapDocumentJson | null {
  const state = { replaced: false }
  const replaced = replaceFirstTextNode(doc, selectedText, insertText, state)
  return state.replaced && isTipTapDoc(replaced) ? replaced : null
}

function replaceFirstTextNode(
  value: unknown,
  selectedText: string,
  insertText: string,
  state: { replaced: boolean },
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceFirstTextNode(item, selectedText, insertText, state),
    )
  }

  if (!isRecord(value)) {
    return value
  }

  if (
    !state.replaced &&
    value.type === 'text' &&
    typeof value.text === 'string' &&
    value.text.includes(selectedText)
  ) {
    state.replaced = true
    return {
      ...value,
      text: value.text.replace(selectedText, insertText),
    }
  }

  const cloned: JsonRecord = {}
  for (const [key, childValue] of Object.entries(value)) {
    cloned[key] = replaceFirstTextNode(childValue, selectedText, insertText, state)
  }
  return cloned
}

function textToParagraphNodes(text: string): JsonRecord[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalized
    .split(/\n+/)
    .filter((paragraphText) => paragraphText.length > 0)
    .map((paragraphText) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraphText }],
    }))
}

function cloneTipTapDoc(value: unknown): TipTapDocumentJson | null {
  const cloned = cloneJsonValue(value)
  return isTipTapDoc(cloned) ? cloned : null
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue)
  }

  if (!isRecord(value)) {
    return value
  }

  const cloned: JsonRecord = {}
  for (const [key, childValue] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(childValue)
  }
  return cloned
}

function isTipTapDoc(value: unknown): value is TipTapDocumentJson {
  if (!isRecord(value)) return false
  if (value.type !== 'doc') return false
  if (!Array.isArray(value.content)) return false
  return value.content.every(isRecord)
}

function isEmptyTipTapDoc(doc: TipTapDocumentJson): boolean {
  return doc.content.length === 0 || !doc.content.some(nodeContainsText)
}

function nodeContainsText(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(nodeContainsText)
  }

  if (!isRecord(value)) {
    return false
  }

  if (value.type === 'text' && typeof value.text === 'string') {
    return value.text.length > 0
  }

  return Object.values(value).some(nodeContainsText)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validationError(message: string) {
  return {
    code: VALIDATION_ERROR,
    message,
    retryable: false,
  }
}
