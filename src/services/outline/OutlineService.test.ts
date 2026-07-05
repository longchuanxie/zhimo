// OutlineService 单元测试
// 覆盖大纲节点创建、Markdown 批量创建、层级关系计算

import { describe, it, expect } from 'vitest'
import { seedTable } from '@/test/fixtures/sqlMock'
import type { ServiceResult } from '@/types/service'
import { createOutlineNode, createOutlineNodesFromMarkdown, convertNodeToDocument } from './OutlineService'

// ============ 测试工具 ============

function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

const DEFAULT_PROJECT_ID = 'p_outline'
const DEFAULT_OUTLINE_ID = 'o_outline'

/// 初始化项目和默认大纲夹具
function seedProjectAndOutline() {
  seedTable('projects', [
    {
      id: DEFAULT_PROJECT_ID,
      workspace_id: 'ws-1',
      name: '测试项目',
      type: 'fiction',
      description: null,
      writing_goal: null,
      target_reader: null,
      target_word_count: 0,
      current_word_count: 0,
      language: 'zh-CN',
      style_rules: null,
      forbidden_rules: null,
      status: 'writing',
      created_by: 'u1',
      updated_by: null,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
  seedTable('outlines', [
    {
      id: DEFAULT_OUTLINE_ID,
      project_id: DEFAULT_PROJECT_ID,
      title: '默认大纲',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
}

// ============ 测试 ============

describe('OutlineService 节点创建与层级', () => {
  it('createOutlineNode 创建根节点时 depth 为 0', async () => {
    seedProjectAndOutline()

    const result = await createOutlineNode({
      projectId: DEFAULT_PROJECT_ID,
      parentId: null,
      title: '第一章',
    })
    const node = unwrap(result)

    expect(node.title).toBe('第一章')
    expect(node.depth).toBe(0)
    expect(node.parentId).toBeNull()
  })

  it('createOutlineNode 传入 parentId 时 depth = parent.depth + 1', async () => {
    seedProjectAndOutline()

    const parent = unwrap(
      await createOutlineNode({
        projectId: DEFAULT_PROJECT_ID,
        parentId: null,
        title: '第一章',
      }),
    )

    const child = unwrap(
      await createOutlineNode({
        projectId: DEFAULT_PROJECT_ID,
        parentId: parent.id,
        title: '第一节',
      }),
    )

    expect(child.depth).toBe(1)
    expect(child.parentId).toBe(parent.id)

    const grandchild = unwrap(
      await createOutlineNode({
        projectId: DEFAULT_PROJECT_ID,
        parentId: child.id,
        title: '第一小节',
      }),
    )

    expect(grandchild.depth).toBe(2)
    expect(grandchild.parentId).toBe(child.id)
  })

  it('createOutlineNode 传入不存在 parentId 时降级为根节点', async () => {
    seedProjectAndOutline()

    const result = await createOutlineNode({
      projectId: DEFAULT_PROJECT_ID,
      parentId: 'non-existent',
      title: '孤立节点',
    })
    const node = unwrap(result)

    expect(node.depth).toBe(0)
    expect(node.parentId).toBe('non-existent')
  })
})

describe('OutlineService Markdown 批量创建', () => {
  it('createOutlineNodesFromMarkdown 解析三级标题层级', async () => {
    seedProjectAndOutline()

    const markdown = `# 卷一
## 第一章
### 第一节
### 第二节
## 第二章
### 第一节`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    expect(nodes.length).toBe(6)

    const rootNodes = nodes.filter((n) => n.depth === 0)
    expect(rootNodes.map((n) => n.title)).toEqual(['卷一'])

    const depth1 = nodes.filter((n) => n.depth === 1)
    expect(depth1.map((n) => n.title)).toEqual(['第一章', '第二章'])

    const depth2 = nodes.filter((n) => n.depth === 2)
    expect(depth2.map((n) => n.title)).toEqual(['第一节', '第二节', '第一节'])

    // 验证父子关系：第一章的子节点
    const chapter1 = nodes.find((n) => n.title === '第一章')
    const section1 = nodes.find((n) => n.title === '第一节' && n.depth === 2)
    expect(section1?.parentId).toBe(chapter1?.id)
  })

  it('createOutlineNodesFromMarkdown 解析缩进列表层级', async () => {
    seedProjectAndOutline()

    const markdown = `- 第一章
  - 第一节
    - 第一小节
  - 第二节
- 第二章`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    expect(nodes.length).toBe(5)
    expect(nodes.map((n) => ({ title: n.title, depth: n.depth }))).toEqual([
      { title: '第一章', depth: 0 },
      { title: '第一节', depth: 1 },
      { title: '第一小节', depth: 2 },
      { title: '第二节', depth: 1 },
      { title: '第二章', depth: 0 },
    ])
  })

  it('createOutlineNodesFromMarkdown 混合标题与列表时列表项作为标题子级', async () => {
    seedProjectAndOutline()

    const markdown = `# 卷一
## 第一章
- 第一节
  - 第一小节
- 第二节
## 第二章
- 第一节`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    expect(nodes.map((n) => ({ title: n.title, depth: n.depth }))).toEqual([
      { title: '卷一', depth: 0 },
      { title: '第一章', depth: 1 },
      { title: '第一节', depth: 2 },
      { title: '第一小节', depth: 3 },
      { title: '第二节', depth: 2 },
      { title: '第二章', depth: 1 },
      { title: '第一节', depth: 2 },
    ])
  })

  it('createOutlineNodesFromMarkdown 有序列表支持缩进层级', async () => {
    seedProjectAndOutline()

    const markdown = `# 第一章
1. 第一节
2. 第二节
   1. 第一小节
   2. 第二小节
3. 第三节`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    expect(nodes.map((n) => ({ title: n.title, depth: n.depth }))).toEqual([
      { title: '第一章', depth: 0 },
      { title: '第一节', depth: 1 },
      { title: '第二节', depth: 1 },
      { title: '第一小节', depth: 2 },
      { title: '第二小节', depth: 2 },
      { title: '第三节', depth: 1 },
    ])
  })

  it('createOutlineNodesFromMarkdown 忽略空行和说明文字', async () => {
    seedProjectAndOutline()

    const markdown = `# 第一章

这是说明文字，不应该成为节点。

## 第一节`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    expect(nodes.length).toBe(2)
    expect(nodes.map((n) => n.title)).toEqual(['第一章', '第一节'])
  })

  it('createOutlineNodesFromMarkdown 保留写作目标到节点描述', async () => {
    seedProjectAndOutline()

    const markdown = `# 第一章
## 第一节 · 远路
**写作目标：** 归途的最后一段。赵九走在荒野上。
### 第一小节
**写作目标：** 细节描写风雪。`

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, markdown)
    const nodes = unwrap(result)

    const section1 = nodes.find((n) => n.title === '第一节 · 远路')
    const subsection = nodes.find((n) => n.title === '第一小节')

    expect(section1?.description).toBe('归途的最后一段。赵九走在荒野上。')
    expect(subsection?.description).toBe('细节描写风雪。')
  })

  it('createOutlineNodesFromMarkdown 空内容返回 VALIDATION_ERROR', async () => {
    seedProjectAndOutline()

    const result = await createOutlineNodesFromMarkdown(DEFAULT_PROJECT_ID, '没有大纲结构的纯文本')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR')
    }
  })
})

describe('OutlineService 节点转文档', () => {
  it('convertNodeToDocument 创建文档并关联到大纲节点', async () => {
    seedProjectAndOutline()

    const node = unwrap(
      await createOutlineNode({
        projectId: DEFAULT_PROJECT_ID,
        parentId: null,
        title: '第一章',
      }),
    )

    const result = await convertNodeToDocument(node.id)
    const updated = unwrap(result)

    expect(updated.linkedDocumentId).not.toBeNull()
  })

  it('convertNodeToDocument 节点不存在返回 NOT_FOUND', async () => {
    seedProjectAndOutline()

    const result = await convertNodeToDocument('non-existent')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })
})
