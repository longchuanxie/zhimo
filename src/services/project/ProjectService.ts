// 项目 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §3
// 负责项目相关的业务逻辑：参数校验、事务边界、状态流转

import type {
  Project,
  ProjectType,
  ProjectStatus,
  Document,
  AgentThread,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  listProjects as repoListProjects,
  findProjectById,
  insertProject,
  updateProject,
  softDeleteProject,
} from '@/services/database/projectRepository'
import {
  insertOutline,
} from '@/services/database/outlineRepository'
import { listDocuments } from '@/services/database/documentRepository'
import { countSourcesByProject } from '@/services/database/sourceRepository'
import { countCardsByProject } from '@/services/database/cardRepository'
import { countKnowledgeByProject } from '@/services/database/knowledgeRepository'
import { findDefaultWorkspace } from '@/services/database/userWorkspaceRepository'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateProjectInput = {
  name: string
  type: ProjectType
  description?: string
  writingGoal?: string
  targetReader?: string
  targetWordCount?: number
  styleRules?: string
  forbiddenRules?: string
}

export type UpdateProjectInput = {
  projectId: string
  patch: Partial<{
    name: string
    description: string
    writingGoal: string
    targetReader: string
    targetWordCount: number
    styleRules: string
    forbiddenRules: string
    status: ProjectStatus
  }>
}

export type ProjectOverview = {
  project: Project
  documentCount: number
  sourceCount: number
  cardCount: number
  knowledgeCount: number
  recentDocuments: Document[]
  recentThreads: AgentThread[]
}

// ============ Service 方法 ============

/// 查询项目列表
export async function listProjects(input?: {
  keyword?: string
  type?: ProjectType
  status?: ProjectStatus
}): Promise<ServiceResult<Project[]>> {
  try {
    const workspace = await findDefaultWorkspace()
    if (!workspace) {
      return err({
        code: NOT_FOUND,
        message: '默认工作空间不存在',
        retryable: false,
      })
    }

    const projects = await repoListProjects({
      workspaceId: workspace.id,
      ...input,
    })
    return ok(projects)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 创建项目
/// 副作用：创建 Project + 创建默认 Outline
export async function createProject(
  input: CreateProjectInput,
): Promise<ServiceResult<Project>> {
  try {
    // 参数校验
    if (!input.name || input.name.trim().length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '项目名称不能为空',
        retryable: false,
      })
    }

    if (!input.type) {
      return err({
        code: VALIDATION_ERROR,
        message: '请选择项目类型',
        retryable: false,
      })
    }

    const workspace = await findDefaultWorkspace()
    if (!workspace) {
      return err({
        code: NOT_FOUND,
        message: '默认工作空间不存在',
        retryable: false,
      })
    }

    const projectId = generateId()

    // 创建项目
    await insertProject({
      id: projectId,
      workspaceId: workspace.id,
      name: input.name.trim(),
      type: input.type,
      description: input.description ?? null,
      writingGoal: input.writingGoal ?? null,
      targetReader: input.targetReader ?? null,
      targetWordCount: input.targetWordCount ?? 0,
      language: 'zh-CN',
      styleRules: input.styleRules ?? null,
      forbiddenRules: input.forbiddenRules ?? null,
      status: 'draft',
      createdBy: workspace.createdBy,
    })

    // 创建默认大纲
    await insertOutline({
      id: generateId(),
      projectId,
      title: '默认大纲',
    })

    // 查询并返回创建的项目
    const project = await findProjectById(projectId)
    if (!project) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '项目创建后查询失败',
        retryable: true,
      })
    }

    return ok(project)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询项目详情
export async function getProject(
  projectId: string,
): Promise<ServiceResult<Project>> {
  try {
    const project = await findProjectById(projectId)
    if (!project) {
      return err({
        code: NOT_FOUND,
        message: '项目不存在',
        retryable: false,
      })
    }
    return ok(project)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新项目设置
export async function updateProjectSettings(
  input: UpdateProjectInput,
): Promise<ServiceResult<Project>> {
  try {
    const project = await findProjectById(input.projectId)
    if (!project) {
      return err({
        code: NOT_FOUND,
        message: '项目不存在',
        retryable: false,
      })
    }

    await updateProject(input.projectId, input.patch)

    const updated = await findProjectById(input.projectId)
    if (!updated) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '项目更新后查询失败',
        retryable: true,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 软删除项目
export async function deleteProject(
  projectId: string,
): Promise<ServiceResult<void>> {
  try {
    const project = await findProjectById(projectId)
    if (!project) {
      return err({
        code: NOT_FOUND,
        message: '项目不存在',
        retryable: false,
      })
    }

    await softDeleteProject(projectId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询项目首页聚合数据
export async function getProjectOverview(
  projectId: string,
): Promise<ServiceResult<ProjectOverview>> {
  try {
    const project = await findProjectById(projectId)
    if (!project) {
      return err({
        code: NOT_FOUND,
        message: '项目不存在',
        retryable: false,
      })
    }

    // 聚合项目数据
    const documents = await listDocuments(projectId)
    const recentDocuments = documents
      .filter((d) => !d.isDeleted)
      .sort((a, b) => {
        const ta = a.lastEditedAt ?? a.updatedAt
        const tb = b.lastEditedAt ?? b.updatedAt
        return tb.localeCompare(ta)
      })
      .slice(0, 5)

    const overview: ProjectOverview = {
      project,
      documentCount: documents.filter((d) => !d.isDeleted).length,
      sourceCount: await countSourcesByProject(projectId),
      cardCount: await countCardsByProject(projectId),
      knowledgeCount: await countKnowledgeByProject(projectId),
      recentDocuments,
      recentThreads: [],
    }

    return ok(overview)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
