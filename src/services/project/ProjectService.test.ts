// ProjectService 单元测试：验证项目概览聚合统计（待优化项 #1）
// 对应待优化项 #1：ProjectOverview 的 sourceCount/cardCount/knowledgeCount 硬编码为 0
//
// 覆盖链路：
// countSourcesByProject / countCardsByProject / countKnowledgeByProject
// → getProjectOverview 聚合三个 count（过滤 is_deleted=1）

import { describe, it, expect } from 'vitest'
import { seedTable } from '@/test/fixtures/sqlMock'
import type { ServiceResult } from '@/types/service'
import { getProjectOverview } from './ProjectService'

// ============ 测试工具 ============

/// 解包 ServiceResult，断言成功并返回 data
function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

/// 解包 ServiceResult，断言失败并返回 error
function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) {
    throw new Error(`Expected error result but got ok: ${JSON.stringify(result.data)}`)
  }
  return result.error
}

// ============ 测试夹具 ============

const DEFAULT_WORKSPACE_ID = 'default_workspace'
const DEFAULT_PROJECT_ID = 'p1'

/// 初始化 workspace + user + project 夹具
function seedProject() {
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
      name: '测试小说',
      type: 'fiction',
      description: null,
      writing_goal: '完成短篇',
      target_reader: '青少年',
      target_word_count: 50000,
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

/// 向 sources/cards/knowledge 各 seed 2 条（1 条 is_deleted=1）
function seedCountedTables() {
  seedTable('sources', [
    {
      id: 's1',
      project_id: DEFAULT_PROJECT_ID,
      title: '资料一',
      type: 'text',
      file_url: null,
      file_name: 'r1.txt',
      file_size: 100,
      mime_type: 'text/plain',
      raw_text: '内容',
      summary_short: null,
      summary_long: null,
      keywords: '[]',
      ai_usage_allowed: 1,
      privacy_level: 'public',
      processing_status: 'ready',
      source_status: 'confirmed',
      error_message: null,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 's2',
      project_id: DEFAULT_PROJECT_ID,
      title: '已删除资料',
      type: 'text',
      file_url: null,
      file_name: 'r2.txt',
      file_size: 100,
      mime_type: 'text/plain',
      raw_text: '内容',
      summary_short: null,
      summary_long: null,
      keywords: '[]',
      ai_usage_allowed: 1,
      privacy_level: 'public',
      processing_status: 'ready',
      source_status: 'confirmed',
      error_message: null,
      is_deleted: 1,
      deleted_at: '2025-01-02T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    },
  ])
  seedTable('cards', [
    {
      id: 'c1',
      project_id: DEFAULT_PROJECT_ID,
      source_id: 's1',
      title: '卡片一',
      content: '内容',
      tags: '[]',
      status: 'confirmed',
      ai_usage_allowed: 1,
      confidence: 0.9,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'c2',
      project_id: DEFAULT_PROJECT_ID,
      source_id: 's1',
      title: '已删除卡片',
      content: '内容',
      tags: '[]',
      status: 'confirmed',
      ai_usage_allowed: 1,
      confidence: 0.9,
      is_deleted: 1,
      deleted_at: '2025-01-02T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    },
  ])
  seedTable('knowledge', [
    {
      id: 'k1',
      project_id: DEFAULT_PROJECT_ID,
      source_id: 's1',
      card_id: 'c1',
      title: '知识一',
      content: '内容',
      category: 'character',
      status: 'confirmed',
      ai_usage_allowed: 1,
      confidence: 0.9,
      replaced_by: null,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'k2',
      project_id: DEFAULT_PROJECT_ID,
      source_id: 's1',
      card_id: 'c1',
      title: '已删除知识',
      content: '内容',
      category: 'character',
      status: 'confirmed',
      ai_usage_allowed: 1,
      confidence: 0.9,
      replaced_by: null,
      is_deleted: 1,
      deleted_at: '2025-01-02T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    },
  ])
}

// ============ 测试 ============

describe('ProjectService 项目概览聚合统计（待优化项 #1）', () => {
  it('getProjectOverview 正确返回 sourceCount/cardCount/knowledgeCount（过滤 is_deleted=1）', async () => {
    seedProject()
    seedCountedTables()

    const result = await getProjectOverview(DEFAULT_PROJECT_ID)
    const overview = unwrap(result)

    expect(overview.sourceCount).toBe(1)
    expect(overview.cardCount).toBe(1)
    expect(overview.knowledgeCount).toBe(1)
    expect(overview.documentCount).toBe(0)
    expect(overview.project.id).toBe(DEFAULT_PROJECT_ID)
  })

  it('getProjectOverview 空项目时三个 count 均为 0', async () => {
    seedProject()
    // 不 seed 任何 sources/cards/knowledge

    const result = await getProjectOverview(DEFAULT_PROJECT_ID)
    const overview = unwrap(result)

    expect(overview.sourceCount).toBe(0)
    expect(overview.cardCount).toBe(0)
    expect(overview.knowledgeCount).toBe(0)
  })

  it('getProjectOverview 项目不存在时返回 NOT_FOUND', async () => {
    // 不 seed 任何项目
    const result = await getProjectOverview('nonexistent_project')

    const error = unwrapErr(result)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('项目不存在')
  })

  it('getProjectOverview 不同项目的 count 互不干扰', async () => {
    seedProject()
    seedCountedTables()
    // 为另一个项目 seed 1 条资料
    seedTable('sources', [
      {
        id: 's_other',
        project_id: 'p_other',
        title: '另一项目资料',
        type: 'text',
        file_url: null,
        file_name: 'other.txt',
        file_size: 100,
        mime_type: 'text/plain',
        raw_text: '内容',
        summary_short: null,
        summary_long: null,
        keywords: '[]',
        ai_usage_allowed: 1,
        privacy_level: 'public',
        processing_status: 'ready',
        source_status: 'confirmed',
        error_message: null,
        is_deleted: 0,
        deleted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ])

    const result = await getProjectOverview(DEFAULT_PROJECT_ID)
    const overview = unwrap(result)

    // p1 仍只有 1 条资料，p_other 的资料不计入
    expect(overview.sourceCount).toBe(1)
  })
})
