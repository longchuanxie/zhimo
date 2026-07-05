// ContextService 单元测试：验证 targetWordCount 注入 LLM 上下文（待优化项 #6）
// 对应待优化项 #6：项目设置中的"目标字数"未注入 Agent 的 ContextPack
//
// 覆盖链路：
// Project.targetWordCount → ContextService.loadProjectRules
// → entries 中追加 title="目标字数"、preview="N 字" 的 required 条目
// → projectRulesSnapshot 含 targetWordCount 字段

import { describe, it, expect } from 'vitest'
import { seedTable } from '@/test/fixtures/sqlMock'
import type { ServiceResult } from '@/types/service'
import { previewContext } from './ContextService'

// ============ 测试工具 ============

/// 解包 ServiceResult，断言成功并返回 data
function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

// ============ 测试夹具 ============

const DEFAULT_WORKSPACE_ID = 'default_workspace'
const DEFAULT_PROJECT_ID = 'p_target'

/// 初始化带 targetWordCount 的项目夹具
function seedProjectWithTarget(targetWordCount: number, description?: string) {
  seedTable('workspaces', [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: '默认工作空间',
      created_by: 'default_user',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
  seedTable('users', [
    {
      id: 'default_user',
      display_name: '默认用户',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
  seedTable('projects', [
    {
      id: DEFAULT_PROJECT_ID,
      workspace_id: DEFAULT_WORKSPACE_ID,
      name: '测试项目',
      type: 'fiction',
      description: description ?? null,
      writing_goal: '完成短篇',
      target_reader: '青少年',
      target_word_count: targetWordCount,
      current_word_count: 0,
      language: 'zh-CN',
      style_rules: null,
      forbidden_rules: null,
      status: 'writing',
      created_by: 'default_user',
      updated_by: null,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ])
}

// ============ 测试 ============

describe('ContextService targetWordCount 注入上下文（待优化项 #6）', () => {
  it('targetWordCount > 0 时，entries 中存在"目标字数"条目', async () => {
    seedProjectWithTarget(50000)

    const result = await previewContext({
      projectId: DEFAULT_PROJECT_ID,
      taskType: 'rewrite',
      boundObjectType: 'project',
      selectedText: '某段选中文本',
    })
    const preview = unwrap(result)

    const targetEntry = preview.entries.find((e) => e.title === '目标字数')
    expect(targetEntry).toBeDefined()
    expect(targetEntry?.preview).toBe('50000 字')
    expect(targetEntry?.kind).toBe('project_rules')
    expect(targetEntry?.required).toBe(true)

    // projectRulesSnapshot 也应包含 targetWordCount
    expect(preview.projectRulesSnapshot?.targetWordCount).toBe(50000)
  })

  it('targetWordCount = 0 时，entries 中不存在"目标字数"条目', async () => {
    seedProjectWithTarget(0)

    const result = await previewContext({
      projectId: DEFAULT_PROJECT_ID,
      taskType: 'rewrite',
      boundObjectType: 'project',
      selectedText: '某段选中文本',
    })
    const preview = unwrap(result)

    const targetEntry = preview.entries.find((e) => e.title === '目标字数')
    expect(targetEntry).toBeUndefined()

    // 快照仍保留 targetWordCount 字段（保持结构完整）
    expect(preview.projectRulesSnapshot?.targetWordCount).toBe(0)
  })

  it('"写作目标"与"目标字数"条目同时存在且顺序正确', async () => {
    seedProjectWithTarget(30000)

    const result = await previewContext({
      projectId: DEFAULT_PROJECT_ID,
      taskType: 'rewrite',
      boundObjectType: 'project',
      selectedText: '某段选中文本',
    })
    const preview = unwrap(result)

    const writingGoalIdx = preview.entries.findIndex((e) => e.title === '写作目标')
    const targetWordCountIdx = preview.entries.findIndex((e) => e.title === '目标字数')

    expect(writingGoalIdx).toBeGreaterThanOrEqual(0)
    expect(targetWordCountIdx).toBeGreaterThanOrEqual(0)
    // targetWordCount 紧跟 writingGoal 之后
    expect(targetWordCountIdx).toBe(writingGoalIdx + 1)
  })

  it('answer_question 任务默认携带 outline_node 上下文', async () => {
    seedProjectWithTarget(30000)
    seedTable('outlines', [
      {
        id: 'o-1',
        project_id: DEFAULT_PROJECT_ID,
        title: '默认大纲',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ])
    seedTable('outline_nodes', [
      {
        id: 'on-1',
        project_id: DEFAULT_PROJECT_ID,
        outline_id: 'o-1',
        parent_id: null,
        title: '卷一',
        description: null,
        status: 'draft',
        sort_order: 0,
        depth: 0,
        linked_document_id: null,
        target_word_count: 0,
        current_word_count: 0,
        is_deleted: 0,
        deleted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'on-2',
        project_id: DEFAULT_PROJECT_ID,
        outline_id: 'o-1',
        parent_id: 'on-1',
        title: '第一章',
        description: '本章介绍背景',
        status: 'draft',
        sort_order: 1,
        depth: 1,
        linked_document_id: null,
        target_word_count: 0,
        current_word_count: 0,
        is_deleted: 0,
        deleted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ])

    const result = await previewContext({
      projectId: DEFAULT_PROJECT_ID,
      taskType: 'answer_question',
      boundObjectType: 'project',
      userInstruction: '接下来写什么？',
    })
    const preview = unwrap(result)

    const outlineEntries = preview.entries.filter((e) => e.kind === 'outline_node')
    expect(outlineEntries.length).toBe(2)

    const chapterEntry = outlineEntries.find((e) => e.refId === 'on-2')
    expect(chapterEntry?.title).toBe('卷一 > 第一章')
    expect(chapterEntry?.preview).toContain('本章介绍背景')
  })

  it('项目 description 非空时，entries 中存在"项目概要"必传条目', async () => {
    const description = '以五代十国乱世为背景，通过一个小人物的视角记录战争遭遇。'
    seedProjectWithTarget(30000, description)

    const result = await previewContext({
      projectId: DEFAULT_PROJECT_ID,
      taskType: 'rewrite',
      boundObjectType: 'project',
      selectedText: '某段选中文本',
    })
    const preview = unwrap(result)

    const descEntry = preview.entries.find((e) => e.title === '项目概要')
    expect(descEntry).toBeDefined()
    expect(descEntry?.preview).toBe(description)
    expect(descEntry?.kind).toBe('project_rules')
    expect(descEntry?.required).toBe(true)

    // projectRulesSnapshot 也应包含 description
    expect(preview.projectRulesSnapshot?.description).toBe(description)

    // 项目概要应排在所有项目规则条目之前
    const descIdx = preview.entries.findIndex((e) => e.title === '项目概要')
    const writingGoalIdx = preview.entries.findIndex((e) => e.title === '写作目标')
    expect(descIdx).toBeLessThan(writingGoalIdx)
  })
})
