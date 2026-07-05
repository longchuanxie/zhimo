// structuredDocToTipTap 转换器单元测试
// 对应任务:项目从外部文档导入
//
// 覆盖:
// - 6 种结构化节点(heading/paragraph/bulletList/orderedList/codeBlock/table)
// - 带 bold/italic marks 的 paragraph
// - ImagePlaceholder 跳过
// - 空文档兜底为单个空段落
// - 多节点混合

import { describe, it, expect } from 'vitest'
import { structuredDocToTipTap } from '../markdownToTipTap'
import type { StructuredDoc, DocxRun } from '@/types/projectImport'

/// 构造 DocxRun 辅助
function run(text: string, bold = false, italic = false): DocxRun {
  return { text, bold, italic }
}

/// 构造最小 StructuredDoc
function doc(nodes: StructuredDoc['nodes']): StructuredDoc {
  return {
    format: 'markdown',
    nodes,
    plainText: '',
    wordCount: 0,
  }
}

describe('structuredDocToTipTap', () => {
  it('空文档兜底为单个空段落', () => {
    const result = structuredDocToTipTap(doc([]))
    expect(result).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    })
  })

  it('全部节点被跳过时也兜底为单个空段落', () => {
    const result = structuredDocToTipTap(doc([{ kind: 'imagePlaceholder' }]))
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({ type: 'paragraph', content: [] })
  })

  it('heading 节点转为 TipTap heading', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'heading', level: 2, text: '标题二' },
    ]))
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '标题二' }],
    })
  })

  it('空文本 heading 被跳过', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'heading', level: 1, text: '' },
    ]))
    // 全部跳过后兜底为空段落
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({ type: 'paragraph', content: [] })
  })

  it('paragraph 节点转为 TipTap paragraph', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('普通文本')] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '普通文本' }],
    })
  })

  it('带 bold 的 paragraph 添加 bold mark', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('粗体', true, false)] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '粗体', marks: [{ type: 'bold' }] }],
    })
  })

  it('带 italic 的 paragraph 添加 italic mark', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('斜体', false, true)] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '斜体', marks: [{ type: 'italic' }] }],
    })
  })

  it('带 bold+italic 的 paragraph 同时添加两个 mark', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('粗斜体', true, true)] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '粗斜体',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      }],
    })
  })

  it('无 mark 的 text 节点不带 marks 字段', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('纯文本')] },
    ]))
    const textNode = (result.content[0] as { content: { type: string; text: string; marks?: unknown[] }[] }).content[0]
    expect(textNode.marks).toBeUndefined()
  })

  it('空文本 run 被过滤', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run(''), run('有效')] },
    ]))
    const para = result.content[0] as { content: unknown[] }
    expect(para.content).toHaveLength(1)
  })

  it('bulletList 节点转为 TipTap bulletList', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'bulletList', items: [[run('项一')], [run('项二')]] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '项一' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '项二' }] }],
        },
      ],
    })
  })

  it('orderedList 节点转为 TipTap orderedList', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'orderedList', items: [[run('第一')], [run('第二')]] },
    ]))
    expect(result.content[0]).toEqual({
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二' }] }],
        },
      ],
    })
  })

  it('空文本 run 的列表项保留为空段落(与 paragraph 行为一致)', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'bulletList', items: [[run('')]] },
    ]))
    // 列表项 runs.length > 0 通过过滤,空文本 run 经 runsToInlines 过滤后产生空段落
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
      ],
    })
  })

  it('items 为空数组时整个列表跳过,兜底为空段落', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'bulletList', items: [] },
    ]))
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({ type: 'paragraph', content: [] })
  })

  it('codeBlock 节点转为 TipTap codeBlock(带 language)', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'codeBlock', language: 'ts', text: 'const x = 1' },
    ]))
    expect(result.content[0]).toEqual({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const x = 1' }],
    })
  })

  it('codeBlock 节点 language 为 null 时保留 null', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'codeBlock', language: null, text: 'plain code' },
    ]))
    expect(result.content[0]).toEqual({
      type: 'codeBlock',
      attrs: { language: null },
      content: [{ type: 'text', text: 'plain code' }],
    })
  })

  it('table 节点转为 TipTap table(行/单元格结构)', () => {
    const result = structuredDocToTipTap(doc([
      {
        kind: 'table',
        rows: [
          [[run('A1')], [run('B1')]],
          [[run('A2')], [run('B2')]],
        ],
      },
    ]))
    expect(result.content[0]).toEqual({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B1' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A2' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B2' }] }] },
          ],
        },
      ],
    })
  })

  it('imagePlaceholder 节点被跳过', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'paragraph', runs: [run('前')] },
      { kind: 'imagePlaceholder' },
      { kind: 'paragraph', runs: [run('后')] },
    ]))
    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toHaveProperty('type', 'paragraph')
    expect(result.content[1]).toHaveProperty('type', 'paragraph')
  })

  it('多节点混合按顺序输出', () => {
    const result = structuredDocToTipTap(doc([
      { kind: 'heading', level: 1, text: '标题' },
      { kind: 'paragraph', runs: [run('正文')] },
      { kind: 'bulletList', items: [[run('项')]] },
    ]))
    expect(result.content).toHaveLength(3)
    expect(result.content[0]).toHaveProperty('type', 'heading')
    expect(result.content[1]).toHaveProperty('type', 'paragraph')
    expect(result.content[2]).toHaveProperty('type', 'bulletList')
  })
})
