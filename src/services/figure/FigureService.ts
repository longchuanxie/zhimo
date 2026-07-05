// 图表 Service
// 负责图表(figure/table)的业务逻辑:CRUD + 自动编号 + label 唯一性 + 悬空交叉引用检测
//
// 架构约束:
// - 通过 figureRepository / sourceRepository 访问 DB
// - 返回 ServiceResult<T>
// - figure 与 table 各自独立编号序列
// - caption 必填(论文图表规范)

import type { Figure, FigureKind, EntityId, IntegrityIssue } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  VALIDATION_ERROR,
  NOT_FOUND,
  FIGURE_NUMBER_CONFLICT,
} from '@/constants/errors'
import {
  listFiguresByDocument,
  findFigureById,
  getMaxFigureNumber,
  findFigureByLabel,
  insertFigure,
  updateFigure as repoUpdateFigure,
  softDeleteFigure,
} from '@/services/database/figureRepository'
import { findSourceById } from '@/services/database/sourceRepository'
import { readBinary } from '@/services/file/fileGateway'
import { open } from '@tauri-apps/plugin-dialog'

// ============ 类型定义 ============

export type CreateFigureInput = {
  projectId: EntityId
  documentId: EntityId
  kind: FigureKind
  caption: string
  label?: string | null
  note?: string | null
  sourceId?: EntityId | null
  imagePath?: string | null
  imageData?: string | null
  tableData?: unknown | null
  prosemirrorPos?: number | null
}

export type UpdateFigureInput = {
  figureId: EntityId
  patch: Partial<{
    caption: string
    label: string | null
    note: string | null
    sourceId: EntityId | null
    imagePath: string | null
    imageData: string | null
    tableData: unknown | null
    prosemirrorPos: number | null
  }>
}

export type DeleteFigureResult = {
  deleted: boolean
  /// 被交叉引用计数(用于 UI 提示)
  crossReferenceCount: number
}

// ============ Service 方法 ============

/// 查询文档内的图表列表(按 kind 过滤,按编号升序)
export async function listFiguresByDocumentId(
  documentId: EntityId,
  kind?: FigureKind,
): Promise<ServiceResult<Figure[]>> {
  try {
    const figures = await listFiguresByDocument(documentId, kind)
    return ok(figures)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询图表详情
export async function getFigure(figureId: EntityId): Promise<ServiceResult<Figure>> {
  try {
    const figure = await findFigureById(figureId)
    if (!figure) {
      return err({ code: NOT_FOUND, message: '图表不存在', retryable: false })
    }
    return ok(figure)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建图表(自动分配编号,校验 label 唯一性)
export async function createFigure(
  input: CreateFigureInput,
): Promise<ServiceResult<Figure>> {
  try {
    // 1. 校验 caption 非空(论文图表规范)
    if (!input.caption.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '图表题注不能为空',
        retryable: false,
      })
    }

    // 2. 校验 label 文档内唯一(若提供)
    if (input.label) {
      const existing = await findFigureByLabel(input.documentId, input.label)
      if (existing) {
        return err({
          code: FIGURE_NUMBER_CONFLICT,
          message: '图表标签在文档内已存在',
          retryable: false,
          suggestedAction: '请更换图表标签,如 fig:architecture',
        })
      }
    }

    // 3. 校验 sourceId 存在(若提供,材料真实性保障)
    if (input.sourceId) {
      const source = await findSourceById(input.sourceId)
      if (!source) {
        return err({
          code: NOT_FOUND,
          message: '关联的资料不存在',
          retryable: false,
        })
      }
    }

    // 4. 自动分配编号(figure 与 table 各自独立序列)
    const maxNumber = await getMaxFigureNumber(input.documentId, input.kind)
    const number = maxNumber + 1

    // 5. 写入
    const created = await insertFigure({
      projectId: input.projectId,
      documentId: input.documentId,
      kind: input.kind,
      number,
      label: input.label ?? null,
      caption: input.caption.trim(),
      note: input.note ?? null,
      sourceId: input.sourceId ?? null,
      imagePath: input.imagePath ?? null,
      imageData: input.imageData ?? null,
      tableData: input.tableData ?? null,
      prosemirrorPos: input.prosemirrorPos ?? null,
    })

    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 选择图片文件并读取为 base64(供 FigureInsertModal 调用)
/// 用户取消选择时返回 ok(null)
export async function pickImageAsBase64(): Promise<ServiceResult<{
  imageData: string
  fileName: string
} | null>> {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: '图片',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
        },
      ],
    })

    if (!selected) {
      return ok(null)
    }

    const filePath = selected as string
    const fileName = filePath.split(/[\\/]/).pop() ?? 'image'
    const bytes = await readBinary(filePath)

    // Uint8Array → base64
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, Array.from(chunk))
    }
    const imageData = btoa(binary)

    return ok({ imageData, fileName })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新图表(修改 label 时重新校验唯一性)
export async function updateFigure(
  input: UpdateFigureInput,
): Promise<ServiceResult<Figure>> {
  try {
    const figure = await findFigureById(input.figureId)
    if (!figure) {
      return err({ code: NOT_FOUND, message: '图表不存在', retryable: false })
    }

    // 校验 caption 非空(若修改)
    if (input.patch.caption !== undefined && !input.patch.caption.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '图表题注不能为空',
        retryable: false,
      })
    }

    // 校验 label 唯一性(若修改且与当前不同)
    if (input.patch.label !== undefined && input.patch.label && input.patch.label !== figure.label) {
      const existing = await findFigureByLabel(figure.documentId, input.patch.label)
      if (existing && existing.id !== figure.id) {
        return err({
          code: FIGURE_NUMBER_CONFLICT,
          message: '图表标签在文档内已存在',
          retryable: false,
          suggestedAction: '请更换图表标签,如 fig:architecture',
        })
      }
    }

    // 校验 sourceId 存在(若修改)
    if (input.patch.sourceId !== undefined && input.patch.sourceId) {
      const source = await findSourceById(input.patch.sourceId)
      if (!source) {
        return err({
          code: NOT_FOUND,
          message: '关联的资料不存在',
          retryable: false,
        })
      }
    }

    await repoUpdateFigure(input.figureId, input.patch)

    const updated = await findFigureById(input.figureId)
    if (!updated) {
      return err({ code: NOT_FOUND, message: '图表不存在', retryable: false })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除图表(软删除)
export async function deleteFigure(
  figureId: EntityId,
): Promise<ServiceResult<DeleteFigureResult>> {
  try {
    const figure = await findFigureById(figureId)
    if (!figure) {
      return err({ code: NOT_FOUND, message: '图表不存在', retryable: false })
    }

    await softDeleteFigure(figureId)
    // 注:交叉引用计数由 UI 层扫描编辑器 JSON 获取,这里返回 0 占位
    return ok({ deleted: true, crossReferenceCount: 0 })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重新编号(按 prosemirrorPos 升序,figure 与 table 各自独立)
export async function renumberFigures(
  documentId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    // 分别对 figure 和 table 重新编号
    for (const kind of ['figure', 'table'] as const) {
      const figures = await listFiguresByDocument(documentId, kind)
      // 按 prosemirrorPos 升序(null 排末尾)
      const sorted = [...figures].sort((a, b) => {
        const pa = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
        const pb = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
        return pa - pb
      })
      for (let i = 0; i < sorted.length; i++) {
        const newNumber = i + 1
        if (sorted[i]!.number !== newNumber) {
          await repoUpdateFigure(sorted[i]!.id, { number: newNumber })
        }
      }
    }
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 交叉引用检测(纯函数,UI 层调用) ============

/**
 * 检测悬空交叉引用
 * @param existingFigureIds 当前文档内存在的 figure ID 集合
 * @param crossReferenceTargets 编辑器中所有 CrossReference mark 的 targetId 列表(仅 targetType=figure/table)
 * @returns 悬空引用列表(引用了不存在的 figure)
 */
export function checkOrphanCrossRefs(
  existingFigureIds: Set<EntityId>,
  crossReferenceTargets: Array<{ targetId: EntityId; targetType: string }>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  for (const ref of crossReferenceTargets) {
    if (ref.targetType === 'figure' || ref.targetType === 'table') {
      if (!existingFigureIds.has(ref.targetId)) {
        issues.push({
          type: 'orphan_cross_ref',
          objectId: ref.targetId,
          description: `交叉引用的目标${ref.targetType === 'figure' ? '图表' : '表格'}已删除`,
          suggestedAction: '请删除该交叉引用或重新关联',
        })
      }
    }
  }
  return issues
}
