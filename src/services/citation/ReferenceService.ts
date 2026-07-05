// 参考文献库 Service
// 负责参考文献的业务逻辑:CRUD + citationKey 唯一性校验 + 从资料导入
// 材料真实性核心:importFromSource 自动关联 sourceId,确保引用可溯源
//
// 架构约束:
// - 通过 referenceRepository / sourceRepository / citationRepository 访问 DB
// - 不直接暴露数据库错误给 UI
// - 返回 ServiceResult<T>

import type { Reference, ReferenceEntryType, AuthorInfo, BibliographicMetadata, EntityId } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  VALIDATION_ERROR,
  NOT_FOUND,
  CITATION_KEY_DUPLICATE,
  BIBLIOGRAPHIC_METADATA_INVALID,
} from '@/constants/errors'
import {
  listReferencesByProject,
  findReferenceById,
  findReferenceByCitationKey,
  findReferencesBySource,
  searchReferences as repoSearchReferences,
  insertReference,
  updateReference as repoUpdateReference,
  softDeleteReference,
} from '@/services/database/referenceRepository'
import { findSourceById } from '@/services/database/sourceRepository'
import { listCitationsByReference } from '@/services/database/citationRepository'

// ============ 类型定义 ============

export type CreateReferenceInput = {
  projectId: EntityId
  sourceId?: EntityId | null
  citationKey: string
  entryType: ReferenceEntryType
  title: string
  authors: AuthorInfo[]
  year?: number | null
  container?: string | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
  publisher?: string | null
  city?: string | null
  doi?: string | null
  isbn?: string | null
  url?: string | null
  accessDate?: string | null
  rawMetadata?: BibliographicMetadata | null
}

export type UpdateReferenceInput = {
  referenceId: EntityId
  patch: Partial<Omit<CreateReferenceInput, 'projectId'>>
}

// ============ Service 方法 ============

/// 列出项目的参考文献
export async function listReferences(
  projectId: EntityId,
): Promise<ServiceResult<Reference[]>> {
  try {
    const references = await listReferencesByProject(projectId)
    return ok(references)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询参考文献详情
export async function getReference(
  referenceId: EntityId,
): Promise<ServiceResult<Reference>> {
  try {
    const reference = await findReferenceById(referenceId)
    if (!reference) {
      return err({
        code: NOT_FOUND,
        message: '参考文献不存在',
        retryable: false,
      })
    }
    return ok(reference)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建参考文献
/// 校验:citationKey 项目内唯一;title/authors/entryType 必填
export async function createReference(
  input: CreateReferenceInput,
): Promise<ServiceResult<Reference>> {
  try {
    // 参数校验
    const trimmedKey = input.citationKey.trim()
    if (!trimmedKey) {
      return err({
        code: VALIDATION_ERROR,
        message: '引用标识不能为空',
        retryable: false,
      })
    }

    const trimmedTitle = input.title.trim()
    if (!trimmedTitle) {
      return err({
        code: VALIDATION_ERROR,
        message: '参考文献标题不能为空',
        retryable: false,
      })
    }

    if (!input.authors || input.authors.length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '至少需要一位作者',
        retryable: false,
      })
    }

    // 校验作者名非空
    const validAuthors = input.authors.filter((a) => a.name.trim())
    if (validAuthors.length === 0) {
      return err({
        code: VALIDATION_ERROR,
        message: '作者姓名不能为空',
        retryable: false,
      })
    }

    // citationKey 项目内唯一性校验
    const existing = await findReferenceByCitationKey(input.projectId, trimmedKey)
    if (existing) {
      return err({
        code: CITATION_KEY_DUPLICATE,
        message: `引用标识 "${trimmedKey}" 已存在`,
        retryable: false,
      })
    }

    const created = await insertReference({
      projectId: input.projectId,
      sourceId: input.sourceId ?? null,
      citationKey: trimmedKey,
      entryType: input.entryType,
      title: trimmedTitle,
      authors: validAuthors,
      year: input.year ?? null,
      container: input.container ?? null,
      volume: input.volume ?? null,
      issue: input.issue ?? null,
      pages: input.pages ?? null,
      publisher: input.publisher ?? null,
      city: input.city ?? null,
      doi: input.doi ?? null,
      isbn: input.isbn ?? null,
      url: input.url ?? null,
      accessDate: input.accessDate ?? null,
      rawMetadata: input.rawMetadata ?? null,
    })

    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新参考文献
/// 若修改 citationKey,需重新校验唯一性
export async function updateReference(
  input: UpdateReferenceInput,
): Promise<ServiceResult<Reference>> {
  try {
    const current = await findReferenceById(input.referenceId)
    if (!current) {
      return err({
        code: NOT_FOUND,
        message: '参考文献不存在',
        retryable: false,
      })
    }

    // 若修改 citationKey,校验唯一性
    if (input.patch.citationKey !== undefined) {
      const trimmedKey = input.patch.citationKey.trim()
      if (!trimmedKey) {
        return err({
          code: VALIDATION_ERROR,
          message: '引用标识不能为空',
          retryable: false,
        })
      }
      if (trimmedKey !== current.citationKey) {
        const existing = await findReferenceByCitationKey(current.projectId, trimmedKey)
        if (existing && existing.id !== current.id) {
          return err({
            code: CITATION_KEY_DUPLICATE,
            message: `引用标识 "${trimmedKey}" 已存在`,
            retryable: false,
          })
        }
      }
      input.patch.citationKey = trimmedKey
    }

    // 若修改 title,校验非空
    if (input.patch.title !== undefined && !input.patch.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '参考文献标题不能为空',
        retryable: false,
      })
    }

    // 若修改 authors,校验非空
    if (input.patch.authors !== undefined) {
      const validAuthors = input.patch.authors.filter((a) => a.name.trim())
      if (validAuthors.length === 0) {
        return err({
          code: VALIDATION_ERROR,
          message: '至少需要一位作者',
          retryable: false,
        })
      }
      input.patch.authors = validAuthors
    }

    await repoUpdateReference(input.referenceId, input.patch)

    const updated = await findReferenceById(input.referenceId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '参考文献不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除参考文献(软删除)
/// 若有 citation 引用,返回警告(不阻断,由 UI 决定)
export async function deleteReference(
  referenceId: EntityId,
): Promise<ServiceResult<{ deleted: boolean; citationCount: number }>> {
  try {
    const reference = await findReferenceById(referenceId)
    if (!reference) {
      return err({
        code: NOT_FOUND,
        message: '参考文献不存在',
        retryable: false,
      })
    }

    // 检查是否有 citation 引用(警告,不阻断)
    const citations = await listCitationsByReference(referenceId)
    const citationCount = citations.length

    await softDeleteReference(referenceId)

    return ok({ deleted: true, citationCount })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 从已导入资料生成参考文献(材料真实性核心)
/// 读取 source.bibliographicMetadata,自动关联 sourceId
/// 若该 source 已生成过 reference,返回已有记录(去重)
export async function importFromSource(
  sourceId: EntityId,
): Promise<ServiceResult<Reference>> {
  try {
    const source = await findSourceById(sourceId)
    if (!source) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }

    // 校验书目元数据
    const metadata = source.bibliographicMetadata
    if (!metadata) {
      return err({
        code: BIBLIOGRAPHIC_METADATA_INVALID,
        message: '该资料未提取书目元数据,无法生成参考文献',
        retryable: false,
      })
    }

    if (!metadata.title || !metadata.authors || metadata.authors.length === 0) {
      return err({
        code: BIBLIOGRAPHIC_METADATA_INVALID,
        message: '书目元数据不完整(缺少标题或作者)',
        retryable: false,
      })
    }

    // 去重:若该 source 已生成过 reference,返回已有记录
    const existing = await findReferencesBySource(sourceId)
    if (existing.length > 0) {
      return ok(existing[0]!)
    }

    // 生成 citationKey:第一作者姓 + 年份 + 标题首词(简化)
    const citationKey = await generateCitationKey(metadata, source.projectId)

    const created = await insertReference({
      projectId: source.projectId,
      sourceId: source.id,
      citationKey,
      entryType: metadata.entryType,
      title: metadata.title,
      authors: metadata.authors,
      year: metadata.year,
      container: metadata.container,
      volume: metadata.volume,
      issue: metadata.issue,
      pages: metadata.pages,
      publisher: metadata.publisher,
      city: metadata.city,
      doi: metadata.doi,
      isbn: metadata.isbn,
      url: metadata.url,
      accessDate: metadata.accessDate,
      rawMetadata: metadata,
    })

    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 搜索参考文献(按标题/作者/citationKey)
export async function searchReferences(
  projectId: EntityId,
  query: string,
): Promise<ServiceResult<Reference[]>> {
  try {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      const all = await listReferencesByProject(projectId)
      return ok(all)
    }
    const results = await repoSearchReferences(projectId, trimmedQuery)
    return ok(results)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部工具 ============

/// 生成 citationKey(项目内唯一)
/// 格式:第一作者姓 + 年份 + 标题首词小写,如 smith2020ai
async function generateCitationKey(
  metadata: BibliographicMetadata,
  projectId: EntityId,
): Promise<string> {
  const firstAuthor = metadata.authors[0]
  const authorName = firstAuthor?.name.trim() || 'anon'
  // 取作者姓(最后一个单词,英文)或全名(中文)
  const isChinese = /[\u4e00-\u9fff]/.test(authorName)
  const lastName = isChinese
    ? authorName
    : authorName.split(/\s+/).pop() || authorName
  const lastNameLower = lastName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')

  const year = metadata.year ?? 'xxxx'
  const titleFirstWord = metadata.title
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '') || 'ref'

  const baseKey = `${lastNameLower}${year}${titleFirstWord}`

  // 若 baseKey 已存在,追加数字后缀
  let key = baseKey
  let suffix = 1
  // eslint-disable-next-line no-await-in-loop
  while (await findReferenceByCitationKey(projectId, key)) {
    key = `${baseKey}${suffix}`
    suffix += 1
  }

  return key
}
