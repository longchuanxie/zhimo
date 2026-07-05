import { describe, expect, it } from 'vitest'
import {
  applyPlainTextPatchToDocumentContent,
  plainTextToTipTapDoc,
} from './DocumentContentPatchService'
import type { ServiceResult } from '@/types/service'

function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`Expected ok but got ${result.error.code}`)
  return result.data
}

function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) throw new Error('Expected error but got ok')
  return result.error
}

describe('DocumentContentPatchService', () => {
  it('append 模式保留已有 TipTap 节点并追加新段落', () => {
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '旧正文' }],
        },
      ],
    }

    const result = applyPlainTextPatchToDocumentContent({
      contentJson,
      plainText: '旧正文',
      insertText: '新正文第一段\n新正文第二段',
      mode: 'append',
    })

    const patch = unwrap(result)
    expect(patch.plainText).toBe('旧正文\n\n新正文第一段\n新正文第二段')
    expect(patch.wordCount).toBe(patch.plainText.length)
    expect(patch.contentJson).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '旧正文' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '新正文第一段' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '新正文第二段' }],
        },
      ],
    })
  })

  it('append 模式在旧 contentJson 非法时回退为基础 TipTap 文档', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: '旧字符串内容',
      plainText: '旧正文',
      insertText: '新正文',
      mode: 'append',
    })

    expect(unwrap(result).contentJson).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '旧正文' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '新正文' }],
        },
      ],
    })
  })

  it('replace_all 模式替换全文并重建 TipTap 文档', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: plainTextToTipTapDoc('旧正文'),
      plainText: '旧正文',
      insertText: '第一段新正文\n第二段新正文',
      mode: 'replace_all',
    })

    const patch = unwrap(result)
    expect(patch.plainText).toBe('第一段新正文\n第二段新正文')
    expect(patch.wordCount).toBe('第一段新正文\n第二段新正文'.length)
    expect(patch.contentJson).toEqual(
      plainTextToTipTapDoc('第一段新正文\n第二段新正文'),
    )
  })

  it('replace_selection 模式优先替换 TipTap text 节点并保留 marks', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '开头旧正文结尾',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      },
      plainText: '开头旧正文结尾',
      insertText: '新的正文',
      mode: 'replace_selection',
      selectedText: '旧正文',
    })

    const patch = unwrap(result)
    expect(patch.plainText).toBe('开头新的正文结尾')
    expect(patch.contentJson.content[0]).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '开头新的正文结尾',
          marks: [{ type: 'bold' }],
        },
      ],
    })
  })

  it('replace_selection 纯文本匹配但 TipTap 节点未匹配时生成一致的基础文档', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '结构内没有目标' }],
          },
        ],
      },
      plainText: '开头旧正文结尾',
      insertText: '新的正文',
      mode: 'replace_selection',
      selectedText: '旧正文',
    })

    const patch = unwrap(result)
    expect(patch.plainText).toBe('开头新的正文结尾')
    expect(patch.contentJson).toEqual(plainTextToTipTapDoc('开头新的正文结尾'))
  })

  it('replace_selection 找不到原选区时返回可重试校验错误', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: null,
      plainText: '当前正文',
      insertText: '新的正文',
      mode: 'replace_selection',
      selectedText: '不存在的原文',
    })

    const error = unwrapErr(result)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.retryable).toBe(true)
  })

  it('未知模式返回不可重试校验错误', () => {
    const result = applyPlainTextPatchToDocumentContent({
      contentJson: null,
      plainText: '',
      insertText: '正文',
      mode: 'replace_section',
    })

    const error = unwrapErr(result)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.retryable).toBe(false)
  })
})
