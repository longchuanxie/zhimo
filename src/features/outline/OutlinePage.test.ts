import { describe, expect, it } from 'vitest'
import { canDraftOutlineNodeBody } from './OutlinePage'

describe('canDraftOutlineNodeBody', () => {
  it('仅允许拥有叶子写作目标子节点的层级起草正文', () => {
    expect(canDraftOutlineNodeBody([])).toBe(false)
    expect(canDraftOutlineNodeBody([{ children: [] }])).toBe(true)
    expect(canDraftOutlineNodeBody([{ children: [] }, { children: [] }])).toBe(true)
    expect(canDraftOutlineNodeBody([{ children: [{ children: [] }] }])).toBe(false)
    expect(canDraftOutlineNodeBody([{ children: [] }, { children: [{ children: [] }] }])).toBe(false)
  })
})
