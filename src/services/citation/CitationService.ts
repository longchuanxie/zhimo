// 引文实例 Service
// 负责引文的业务逻辑:CRUD + 编号管理 + 参考文献表生成 + 悬空检测
//
// 架构约束:
// - 通过 citationRepository / referenceRepository 访问 DB
// - 调用 Gbt7714Formatter 生成行内文本与参考文献表
// - 返回 ServiceResult<T>

import type {
  Citation,
  CitationFormat,
  CitationStyle,
  Reference,
  EntityId,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  NOT_FOUND,
  REFERENCE_NOT_FOUND,
} from '@/constants/errors'
import {
  listCitationsByDocument,
  findCitationById,
  insertCitation,
  updateCitation as repoUpdateCitation,
  softDeleteCitation,
} from '@/services/database/citationRepository'
import { findReferenceById } from '@/services/database/referenceRepository'
import { formatInlineText, formatBibliography } from './Gbt7714Formatter'

// ============ 类型定义 ============

export type CreateCitationInput = {
  projectId: EntityId
  documentId: EntityId
  referenceId: EntityId
  citationFormat: CitationFormat
  locator?: string | null
  prefix?: string | null
  suffix?: string | null
  prosemirrorPos?: number | null
}

export type UpdateCitationInput = {
  citationId: EntityId
  patch: Partial<{
    citationFormat: CitationFormat
    locator: string | null
    prefix: string | null
    suffix: string | null
    prosemirrorPos: number | null
  }>
}

// ============ Service 方法 ============

/// 列出文档内的所有引文(按 prosemirrorPos 升序)
export async function listCitationsByDocumentId(
  documentId: EntityId,
): Promise<ServiceResult<Citation[]>> {
  try {
    const citations = await listCitationsByDocument(documentId)
    // 按 prosemirrorPos 升序(null 视为无穷大,排末尾)
    const sorted = [...citations].sort((a, b) => {
      const posA = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      const posB = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      return posA - posB
    })
    return ok(sorted)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询引文详情
export async function getCitation(
  citationId: EntityId,
): Promise<ServiceResult<Citation>> {
  try {
    const citation = await findCitationById(citationId)
    if (!citation) {
      return err({
        code: NOT_FOUND,
        message: '引文不存在',
        retryable: false,
      })
    }
    return ok(citation)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建引文
/// 校验:referenceId 必须存在;自动生成 inlineText
export async function createCitation(
  input: CreateCitationInput,
): Promise<ServiceResult<Citation>> {
  try {
    // 校验 reference 存在
    const reference = await findReferenceById(input.referenceId)
    if (!reference) {
      return err({
        code: REFERENCE_NOT_FOUND,
        message: '关联的参考文献不存在,无法创建引文',
        retryable: false,
      })
    }

    // 生成 inlineText(numeric 格式暂用临时编号,renumberCitations 时更新)
    const tempCitation: Citation = {
      id: 'temp',
      projectId: input.projectId,
      documentId: input.documentId,
      referenceId: input.referenceId,
      citationFormat: input.citationFormat,
      locator: input.locator ?? null,
      prefix: input.prefix ?? null,
      suffix: input.suffix ?? null,
      inlineText: '',
      prosemirrorPos: input.prosemirrorPos ?? null,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // numeric 格式:先分配临时编号(renumber 时会更新)
    const tempNumber = input.citationFormat === 'numeric' ? 1 : undefined
    const inlineText = formatInlineText(
      tempCitation,
      reference,
      'gbt7714_2015',
      tempNumber,
    )

    const created = await insertCitation({
      projectId: input.projectId,
      documentId: input.documentId,
      referenceId: input.referenceId,
      citationFormat: input.citationFormat,
      locator: input.locator ?? null,
      prefix: input.prefix ?? null,
      suffix: input.suffix ?? null,
      inlineText,
      prosemirrorPos: input.prosemirrorPos ?? null,
    })

    // numeric 格式:创建后触发 renumber
    if (input.citationFormat === 'numeric') {
      await renumberCitationsInternal(input.documentId)
      const renumbered = await findCitationById(created.id)
      if (renumbered) {
        return ok(renumbered)
      }
    }

    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新引文(locator/prefix/suffix/format/prosemirrorPos)
export async function updateCitation(
  input: UpdateCitationInput,
): Promise<ServiceResult<Citation>> {
  try {
    const current = await findCitationById(input.citationId)
    if (!current) {
      return err({
        code: NOT_FOUND,
        message: '引文不存在',
        retryable: false,
      })
    }

    await repoUpdateCitation(input.citationId, input.patch)

    // 若修改了影响 inlineText 的字段(locator/prefix/suffix/format),重新生成
    const needRegenerate =
      input.patch.locator !== undefined ||
      input.patch.prefix !== undefined ||
      input.patch.suffix !== undefined ||
      input.patch.citationFormat !== undefined

    if (needRegenerate) {
      const reference = await findReferenceById(current.referenceId)
      if (reference) {
        const updated = await findCitationById(input.citationId)
        if (updated) {
          // numeric 格式需要当前编号
          const numericNumber = updated.citationFormat === 'numeric'
            ? await getNumericNumber(updated)
            : undefined
          const newInlineText = formatInlineText(
            updated,
            reference,
            'gbt7714_2015',
            numericNumber,
          )
          await repoUpdateCitation(input.citationId, { inlineText: newInlineText })
        }
      }
    }

    const result = await findCitationById(input.citationId)
    if (!result) {
      return err({
        code: NOT_FOUND,
        message: '引文不存在',
        retryable: false,
      })
    }
    return ok(result)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除引文(软删除)
/// numeric 格式:删除后触发 renumber
export async function deleteCitation(
  citationId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    const citation = await findCitationById(citationId)
    if (!citation) {
      return err({
        code: NOT_FOUND,
        message: '引文不存在',
        retryable: false,
      })
    }

    await softDeleteCitation(citationId)

    // numeric 格式:删除后重新编号
    if (citation.citationFormat === 'numeric') {
      await renumberCitationsInternal(citation.documentId)
    }

    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重新编号文档内的 numeric 引文(按 prosemirrorPos 升序)
export async function renumberCitations(
  documentId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    await renumberCitationsInternal(documentId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 生成参考文献表(GB/T 7714-2015,按引用顺序,去重)
export async function generateBibliography(
  documentId: EntityId,
  style: CitationStyle,
): Promise<ServiceResult<string[]>> {
  try {
    void style // MVP 仅 gbt7714_2015,预留
    const citations = await listCitationsByDocument(documentId)
    // 按 prosemirrorPos 升序
    const sorted = [...citations].sort((a, b) => {
      const posA = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      const posB = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      return posA - posB
    })

    // 收集所有涉及的 referenceId(去重)
    const referenceIds = [...new Set(sorted.map((c) => c.referenceId))]
    const references = new Map<string, Reference>()
    for (const refId of referenceIds) {
      const ref = await findReferenceById(refId)
      if (ref && !ref.isDeleted) {
        references.set(refId, ref)
      }
    }

    const bibliography = formatBibliography(sorted, references)
    return ok(bibliography)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 检测悬空引文(引用了已删除/不存在 reference 的 citation)
export async function checkOrphanCitations(
  documentId: EntityId,
): Promise<ServiceResult<Citation[]>> {
  try {
    const citations = await listCitationsByDocument(documentId)
    const orphans: Citation[] = []
    for (const citation of citations) {
      const ref = await findReferenceById(citation.referenceId)
      if (!ref || ref.isDeleted) {
        orphans.push(citation)
      }
    }
    return ok(orphans)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取文档所有引文对应的 reference 列表(去重,用于导出参考文献)
export async function listDocumentReferences(
  documentId: EntityId,
): Promise<ServiceResult<Reference[]>> {
  try {
    const citations = await listCitationsByDocument(documentId)
    const referenceIds = [...new Set(citations.map((c) => c.referenceId))]
    const references: Reference[] = []
    for (const refId of referenceIds) {
      const ref = await findReferenceById(refId)
      if (ref && !ref.isDeleted) {
        references.push(ref)
      }
    }
    return ok(references)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部工具 ============

/// 重新编号 numeric 引文(内部实现,不返回 ServiceResult)
async function renumberCitationsInternal(documentId: EntityId): Promise<void> {
  const citations = await listCitationsByDocument(documentId)
  // 只对 numeric 格式编号,按 prosemirrorPos 升序
  const numericCitations = citations
    .filter((c) => c.citationFormat === 'numeric')
    .sort((a, b) => {
      const posA = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      const posB = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      return posA - posB
    })

  // 为每个 numeric citation 分配编号并更新 inlineText
  for (let i = 0; i < numericCitations.length; i++) {
    const citation = numericCitations[i]!
    const number = i + 1
    const reference = await findReferenceById(citation.referenceId)
    if (!reference) continue

    const newInlineText = formatInlineText(
      citation,
      reference,
      'gbt7714_2015',
      number,
    )

    // 仅当 inlineText 变化时更新
    if (newInlineText !== citation.inlineText) {
      await repoUpdateCitation(citation.id, { inlineText: newInlineText })
    }
  }
}

/// 获取 numeric citation 的当前编号(按 prosemirrorPos 排序后的序号)
async function getNumericNumber(citation: Citation): Promise<number | undefined> {
  if (citation.citationFormat !== 'numeric') return undefined
  const all = await listCitationsByDocument(citation.documentId)
  const numericSorted = all
    .filter((c) => c.citationFormat === 'numeric')
    .sort((a, b) => {
      const posA = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      const posB = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      return posA - posB
    })
  const idx = numericSorted.findIndex((c) => c.id === citation.id)
  return idx >= 0 ? idx + 1 : undefined
}
