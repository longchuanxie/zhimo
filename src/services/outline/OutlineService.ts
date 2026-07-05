// 大纲 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §7
// 负责大纲相关的业务逻辑：节点创建、编辑、排序、转文档

import type { Outline, OutlineNode, OutlineNodeStatus } from '@/types'
import type { ServiceResult } from '@/types/service'
import type { AppError } from '@/types/error'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND } from '@/constants/errors'
import {
  findOutlineByProjectId,
  listOutlineNodesByProject,
  findOutlineNodeById,
  insertOutlineNode,
  updateOutlineNode,
  updateOutlineNodeSort,
  softDeleteOutlineNode,
  getMaxSortOrder,
} from '@/services/database/outlineRepository'
import { createDocument, deleteDocument } from '@/services/document/DocumentService'
import { generateId } from '@/services/database/mapping'

// ============ 类型定义 ============

export type CreateOutlineNodeInput = {
  projectId: string
  parentId: string | null
  title: string
  description?: string
  targetWordCount?: number
}

export type UpdateOutlineNodeInput = {
  nodeId: string
  patch: Partial<{
    title: string
    description: string
    status: OutlineNodeStatus
    targetWordCount: number
    linkedDocumentId: string | null
  }>
}

export type OutlineWithNodes = {
  outline: Outline
  nodes: OutlineNode[]
}

// ============ Service 方法 ============

/// 查询项目大纲（含所有节点）
export async function getOutline(
  projectId: string,
): Promise<ServiceResult<OutlineWithNodes>> {
  try {
    const outline = await findOutlineByProjectId(projectId)
    if (!outline) {
      return err({
        code: NOT_FOUND,
        message: '大纲不存在',
        retryable: false,
      })
    }

    const nodes = await listOutlineNodesByProject(projectId)
    return ok({ outline, nodes })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 创建大纲节点
export async function createOutlineNode(
  input: CreateOutlineNodeInput,
): Promise<ServiceResult<OutlineNode>> {
  try {
    if (!input.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '节点标题不能为空',
        retryable: false,
      })
    }

    const outline = await findOutlineByProjectId(input.projectId)
    if (!outline) {
      return err({
        code: NOT_FOUND,
        message: '大纲不存在',
        retryable: false,
      })
    }

    // 计算排序和深度
    const maxSort = await getMaxSortOrder(outline.id, input.parentId)
    const sortOrder = maxSort + 1
    let depth = 0
    if (input.parentId) {
      const parent = await findOutlineNodeById(input.parentId)
      depth = parent ? parent.depth + 1 : 0
    }

    const nodeId = generateId()
    await insertOutlineNode({
      id: nodeId,
      projectId: input.projectId,
      outlineId: outline.id,
      parentId: input.parentId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      sortOrder,
      depth,
    })

    // 如果有目标字数，更新
    if (input.targetWordCount && input.targetWordCount > 0) {
      await updateOutlineNode(nodeId, { targetWordCount: input.targetWordCount })
    }

    const node = await findOutlineNodeById(nodeId)
    if (!node) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '节点创建后查询失败',
        retryable: true,
      })
    }

    return ok(node)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 从 Markdown 文本批量创建大纲节点
///
/// 解析 Markdown 格式的大纲（支持 `#`/`##`/`###` 标题和 `-`/`*`/`+` 缩进列表），
/// 按层级关系批量创建节点。用于 Agent 生成大纲后的采纳操作。
///
/// 解析规则：
/// - `# 标题` → depth 0，`## 标题` → depth 1，依此类推
/// - `- 标题` / `* 标题` / `+ 标题` → 按缩进空格数计算层级（每 2 空格一层）
/// - `1. 标题` 等数字编号 → depth 0
/// - 空行与非列表/非标题文本跳过
///
/// 创建策略：
/// - 按解析顺序逐个创建，通过 parentId 栈维护父子关系
/// - 单个节点创建失败（如标题为空）跳过，不阻塞后续节点
/// - 返回所有成功创建的节点
export async function createOutlineNodesFromMarkdown(
  projectId: string,
  markdown: string,
): Promise<ServiceResult<OutlineNode[]>> {
  try {
    const outline = await findOutlineByProjectId(projectId)
    if (!outline) {
      return err({
        code: NOT_FOUND,
        message: '大纲不存在',
        retryable: false,
      })
    }

    const parsedNodes = parseMarkdownOutline(markdown)
    if (parsedNodes.length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '无法从内容中解析出大纲结构',
        retryable: false,
      })
    }

    const createdNodes: OutlineNode[] = []
    // parentIdStack[depth] = 该层级最近创建的节点 ID，用于建立父子关系
    const parentIdStack: (string | null)[] = [null]

    for (const parsed of parsedNodes) {
      const parentId = parentIdStack[parsed.depth] ?? null
      const result = await createOutlineNode({
        projectId,
        parentId,
        title: parsed.title,
        description: parsed.description,
      })
      if (result.ok) {
        createdNodes.push(result.data)
        // 记录当前节点作为下一层的父节点候选
        parentIdStack[parsed.depth + 1] = result.data.id
        // 清除更深层级的旧记录，避免错挂到前一个分支
        parentIdStack.length = parsed.depth + 2
      }
    }

    if (createdNodes.length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '所有大纲节点创建失败',
        retryable: false,
      })
    }

    return ok(createdNodes)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部工具 ============

type ParsedOutlineNode = {
  title: string
  /// 0 = 根节点，1 = 一级子节点，依此类推
  depth: number
  /// 写作目标/节点描述，通常来自 **写作目标：** 后的说明文字
  description?: string
}

/// 解析 Markdown 大纲文本为节点列表
///
/// 支持三种格式：
/// 1. ATX 标题：`#`、`##`、`###` ...（depth = # 数 - 1）
/// 2. 无序列表：`-`、`*`、`+` 开头。若紧跟在标题之后，默认作为该标题的子级；
///    否则按行首缩进空格数计算层级（每 2 空格一层）
/// 3. 有序列表：`1.`、`2.` ... 同无序列表，支持缩进层级
///
/// 同时做深度规范化：任何节点最多比前一条深 1 层，避免标题后直接跳过多层导致孤儿节点。
/// 其他行（纯文本段落、说明性文字）跳过。
function parseMarkdownOutline(markdown: string): ParsedOutlineNode[] {
  const lines = markdown.split('\n')
  const result: ParsedOutlineNode[] = []
  /// 最近一条标题的绝对深度，-1 表示尚未遇到标题
  let lastHeaderDepth = -1

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    // 1. ATX 标题：# ~ ######
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const depth = headerMatch[1]!.length - 1
      const title = cleanTitle(headerMatch[2]!.trim())
      if (title) {
        result.push({ title, depth })
        lastHeaderDepth = depth
      }
      continue
    }

    // 2. 无序列表：行首缩进 + -/*/+  
    const listMatch = rawLine.match(/^(\s*)[-*+]\s+(.+)$/)
    if (listMatch) {
      const indent = listMatch[1]!.length
      const relativeDepth = Math.floor(indent / 2)
      // 若已有标题上下文，列表项默认作为该标题的子级；否则按自身缩进作为根层级
      const depth = lastHeaderDepth >= 0 ? lastHeaderDepth + 1 + relativeDepth : relativeDepth
      const title = cleanTitle(listMatch[2]!.trim())
      if (title) result.push({ title, depth })
      continue
    }

    // 3. 有序列表：1. 2. 3.（支持缩进层级）
    const orderedMatch = rawLine.match(/^(\s*)\d+\.\s+(.+)$/)
    if (orderedMatch) {
      const indent = orderedMatch[1]!.length
      const relativeDepth = Math.floor(indent / 2)
      const depth = lastHeaderDepth >= 0 ? lastHeaderDepth + 1 + relativeDepth : relativeDepth
      const title = cleanTitle(orderedMatch[2]!.trim())
      if (title) result.push({ title, depth })
      continue
    }

    // 4. 写作目标/节点描述：附加到最近一个节点
    const goalMatch = trimmed.match(/^\*{0,2}写作目标[：:]\*{0,2}\s*(.+)$/)
    if (goalMatch) {
      const description = cleanTitle(goalMatch[1]!.trim())
      const lastNode = result[result.length - 1]
      if (lastNode && description) {
        lastNode.description = lastNode.description
          ? `${lastNode.description}\n${description}`
          : description
      }
      continue
    }

    // 其他行跳过（说明性文字、空行等）
  }

  // 深度规范化：任何节点不能比前一个节点深超过 1 层
  for (let i = 0; i < result.length; i++) {
    if (i === 0) {
      result[i]!.depth = 0
    } else {
      const prevDepth = result[i - 1]!.depth
      if (result[i]!.depth > prevDepth + 1) {
        result[i]!.depth = prevDepth + 1
      }
    }
  }

  return result
}

/// 清理标题中的 Markdown 强调标记
function cleanTitle(title: string): string {
  return title
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
}

/// 更新大纲节点
export async function updateOutlineNodeService(
  input: UpdateOutlineNodeInput,
): Promise<ServiceResult<OutlineNode>> {
  try {
    const node = await findOutlineNodeById(input.nodeId)
    if (!node) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    if (input.patch.title !== undefined && !input.patch.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '节点标题不能为空',
        retryable: false,
      })
    }

    await updateOutlineNode(input.nodeId, input.patch)

    const updated = await findOutlineNodeById(input.nodeId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除大纲节点（软删除）
export async function deleteOutlineNode(
  nodeId: string,
): Promise<ServiceResult<void>> {
  try {
    const node = await findOutlineNodeById(nodeId)
    if (!node) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    await softDeleteOutlineNode(nodeId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 大纲节点排序：上移/下移
export async function moveOutlineNode(
  nodeId: string,
  direction: 'up' | 'down',
): Promise<ServiceResult<void>> {
  try {
    const node = await findOutlineNodeById(nodeId)
    if (!node) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    // 查询同级节点
    const allNodes = await listOutlineNodesByProject(node.projectId)
    const siblings = allNodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const currentIndex = siblings.findIndex((n) => n.id === nodeId)
    if (currentIndex < 0) return ok(undefined)

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= siblings.length) return ok(undefined)

    const targetNode = siblings[targetIndex]!

    // 交换排序值
    await updateOutlineNodeSort(node.id, targetNode.sortOrder, node.parentId, node.depth)
    await updateOutlineNodeSort(targetNode.id, node.sortOrder, targetNode.parentId, targetNode.depth)

    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 大纲节点转文档
/// 创建一个新文档，并将文档 ID 关联到大纲节点
/// 两步写入顺序执行；若关联失败则补偿删除孤儿文档
export async function convertNodeToDocument(
  nodeId: string,
): Promise<ServiceResult<OutlineNode>> {
  try {
    const node = await findOutlineNodeById(nodeId)
    if (!node) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    // 如果已关联文档，直接返回
    if (node.linkedDocumentId) {
      return ok(node)
    }

    // 第一步：创建文档
    const docResult = await createDocument({
      projectId: node.projectId,
      title: node.title,
      outlineNodeId: node.id,
    })

    if (!docResult.ok) {
      return err(docResult.error)
    }

    // 第二步：关联文档到节点
    try {
      await updateOutlineNode(node.id, {
        linkedDocumentId: docResult.data.id,
        status: 'writing',
      })
    } catch (linkError) {
      // 补偿：关联失败时删除孤儿文档
      await deleteDocument(docResult.data.id)
      throw linkError
    }

    const refreshed = await findOutlineNodeById(nodeId)
    if (!refreshed) {
      return err({
        code: NOT_FOUND,
        message: '节点不存在',
        retryable: false,
      })
    }

    return ok(refreshed)
  } catch (error) {
    // ServiceResult 错误对象（AppError 形态）直接透传，避免包装两层
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return err(error as AppError)
    }
    return err(fromUnknown(error))
  }
}
