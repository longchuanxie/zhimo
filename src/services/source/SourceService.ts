// 资料 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §5
// 负责资料相关的业务逻辑：导入、解析、状态流转

import type { Source, SourceChunk, SourceType, ParsedSource, ParsedChunk } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { VALIDATION_ERROR, NOT_FOUND, FILE_TYPE_UNSUPPORTED, SOURCE_PARSE_FAILED, SOURCE_EMPTY_TEXT, SOURCE_OCR_REQUIRED } from '@/constants/errors'
import {
  listSources as repoListSources,
  findSourceById,
  insertSource,
  updateSourceProcessingStatus,
  updateSourceParsedContent,
  updateSourceTitle,
  updateSourceAiUsage,
  updateSourceStatus,
  softDeleteSource,
  listSourceChunks,
  insertSourceChunk,
  deleteSourceChunks,
} from '@/services/database/sourceRepository'
import { generateId } from '@/services/database/mapping'
import {
  readText,
  copyFileTo,
  ensureDir,
  joinPath,
} from '@/services/file/fileGateway'
import { getProjectSourcesDir } from '@/services/file/pathUtil'
import { parseSourceFile } from '@/services/source/SourceParser'
import { open } from '@tauri-apps/plugin-dialog'

// ============ 类型定义 ============

export type ImportFileInput = {
  projectId: string
  /// 是否允许 AI 使用
  aiUsageAllowed?: boolean
}

export type CreateTextSourceInput = {
  projectId: string
  title: string
  content: string
  aiUsageAllowed?: boolean
}

export type UpdateSourceSettingsInput = {
  sourceId: string
  title?: string
  aiUsageAllowed?: boolean
  sourceStatus?: 'active' | 'archived'
}

export type SourceDetail = {
  source: Source
  chunks: SourceChunk[]
}

// ============ 支持的文件类型 ============

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf', '.docx']
const EXTENSION_TO_TYPE: Record<string, SourceType> = {
  '.txt': 'txt',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.pdf': 'pdf',
  '.docx': 'word',
}

// ============ Service 方法 ============

/// 查询资料列表
export async function listSources(
  projectId: string,
): Promise<ServiceResult<Source[]>> {
  try {
    const sources = await repoListSources(projectId)
    return ok(sources)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询资料详情（含片段）
export async function getSourceDetail(
  sourceId: string,
): Promise<ServiceResult<SourceDetail>> {
  try {
    const source = await findSourceById(sourceId)
    if (!source) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }
    const chunks = await listSourceChunks(sourceId)
    return ok({ source, chunks })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 导入本地文件
/// 支持 TXT / Markdown / PDF / Word(.docx)
export async function importFile(
  input: ImportFileInput,
): Promise<ServiceResult<Source>> {
  try {
    // 打开文件选择对话框
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: '文档资料',
          extensions: ['txt', 'md', 'markdown', 'pdf', 'docx'],
        },
      ],
    })

    if (!selected) {
      return err({
        code: 'OPERATION_CANCELLED',
        message: '已取消选择文件',
        retryable: false,
      })
    }

    const filePath = selected as string
    const ext = getExtension(filePath).toLowerCase()

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return err({
        code: FILE_TYPE_UNSUPPORTED,
        message: '暂仅支持 TXT、Markdown、PDF、Word 文件',
        retryable: false,
      })
    }

    const sourceType = EXTENSION_TO_TYPE[ext] ?? 'other'
    const fileName = getBaseName(filePath)

    // 复制文件到项目资料目录(所有类型统一)
    const sourcesDir = await getProjectSourcesDir(input.projectId)
    await ensureDir(sourcesDir)
    const sourceId = generateId()
    const targetFileName = `${sourceId}_${fileName}`
    const targetPath = await joinPath(sourcesDir, targetFileName)
    await copyFileTo(filePath, targetPath)

    // 按类型分流:pdf/docx 走 Rust 端解析,其他走原文本读取流程
    if (sourceType === 'pdf' || sourceType === 'word') {
      return await importParsedFile(input, sourceId, sourceType, fileName, targetPath, ext)
    } else {
      return await importTextFile(input, sourceId, sourceType, fileName, targetPath, ext, filePath)
    }
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 导入 PDF / Word(Rust 端解析)
///
/// 状态流转:pending(插入时) → parsing → parsed → ready / failed
async function importParsedFile(
  input: ImportFileInput,
  sourceId: string,
  sourceType: SourceType,
  fileName: string,
  targetPath: string,
  ext: string,
): Promise<ServiceResult<Source>> {
  // 1. 插入 pending 记录(rawText 暂为 null,解析后更新)
  await insertSource({
    id: sourceId,
    projectId: input.projectId,
    title: fileName,
    type: sourceType,
    fileUrl: targetPath,
    fileName,
    fileSize: null,
    mimeType: getMimeType(ext),
    rawText: null,
    aiUsageAllowed: input.aiUsageAllowed ?? true,
    privacyLevel: 'local_only',
  })

  // 2. 更新为解析中
  await updateSourceProcessingStatus(sourceId, 'parsing', null)

  // 3. 调用 Rust 端解析
  let parsed: ParsedSource
  try {
    parsed = await parseSourceFile(targetPath, /* enableOcr */ true)
  } catch (error) {
    const errorMsg = String(error)
    // 判断是否为 OCR 相关错误(Rust 端返回错误码字符串)
    const isOcrRequired = errorMsg.includes('SOURCE_OCR_REQUIRED')
    await updateSourceProcessingStatus(sourceId, 'failed', errorMsg)
    return err({
      code: isOcrRequired ? SOURCE_OCR_REQUIRED : SOURCE_PARSE_FAILED,
      message: isOcrRequired
        ? '检测到扫描版 PDF,暂不支持 OCR 识别'
        : `资料解析失败: ${errorMsg}`,
      // SOURCE_PARSE_FAILED:可能是临时文件损坏,可重试
      // SOURCE_OCR_REQUIRED:OCR 未实现,重试无意义(与 errors.ts 一致)
      retryable: !isOcrRequired,
    })
  }

  // 4. 解析成功,校验文本非空
  if (!parsed.text.trim()) {
    await updateSourceProcessingStatus(sourceId, 'failed', '解析结果为空')
    return err({
      code: SOURCE_EMPTY_TEXT,
      message: '没有提取到可用文本',
      retryable: false,
    })
  }

  // 5. 更新 rawText 和状态为 parsed
  await updateSourceParsedContent({
    id: sourceId,
    rawText: parsed.text,
    processingStatus: 'parsed',
  })

  // 6. 分片入库
  await createChunksFromParsed(sourceId, input.projectId, parsed.chunks)

  // 7. 更新为 ready
  await updateSourceProcessingStatus(sourceId, 'ready', null)

  const source = await findSourceById(sourceId)
  if (!source) {
    return err({
      code: 'UNKNOWN_ERROR',
      message: '资料创建后查询失败',
      retryable: true,
    })
  }

  return ok(source)
}

/// 导入 txt/md/markdown(原文本读取流程)
async function importTextFile(
  input: ImportFileInput,
  sourceId: string,
  sourceType: SourceType,
  fileName: string,
  targetPath: string,
  ext: string,
  filePath: string,
): Promise<ServiceResult<Source>> {
  // 读取文件内容
  const rawText = await readText(filePath)

  if (!rawText.trim()) {
    return err({
      code: SOURCE_EMPTY_TEXT,
      message: '文件内容为空',
      retryable: false,
    })
  }

  // 创建资料记录
  await insertSource({
    id: sourceId,
    projectId: input.projectId,
    title: fileName,
    type: sourceType,
    fileUrl: targetPath,
    fileName,
    fileSize: rawText.length,
    mimeType: getMimeType(ext),
    rawText,
    aiUsageAllowed: input.aiUsageAllowed ?? true,
    privacyLevel: 'local_only',
  })

  // 更新为已解析状态
  await updateSourceProcessingStatus(sourceId, 'ready', null)

  // 分片入库
  const chunks = splitIntoChunks(rawText)
  await createChunksFromParsed(sourceId, input.projectId, chunks)

  const source = await findSourceById(sourceId)
  if (!source) {
    return err({
      code: 'UNKNOWN_ERROR',
      message: '资料创建后查询失败',
      retryable: true,
    })
  }

  return ok(source)
}

/// 粘贴文本创建资料
export async function createTextSource(
  input: CreateTextSourceInput,
): Promise<ServiceResult<Source>> {
  try {
    if (!input.title.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '资料标题不能为空',
        retryable: false,
      })
    }

    if (!input.content.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '资料内容不能为空',
        retryable: false,
      })
    }

    const sourceId = generateId()

    await insertSource({
      id: sourceId,
      projectId: input.projectId,
      title: input.title.trim(),
      type: 'text',
      fileUrl: null,
      fileName: null,
      fileSize: input.content.length,
      mimeType: 'text/plain',
      rawText: input.content,
      aiUsageAllowed: input.aiUsageAllowed ?? true,
      privacyLevel: 'local_only',
    })

    await updateSourceProcessingStatus(sourceId, 'ready', null)
    await createChunksFromParsed(sourceId, input.projectId, splitIntoChunks(input.content))

    const source = await findSourceById(sourceId)
    if (!source) {
      return err({
        code: 'UNKNOWN_ERROR',
        message: '资料创建后查询失败',
        retryable: true,
      })
    }

    return ok(source)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新资料设置
export async function updateSourceSettings(
  input: UpdateSourceSettingsInput,
): Promise<ServiceResult<Source>> {
  try {
    const source = await findSourceById(input.sourceId)
    if (!source) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }

    if (input.title !== undefined) {
      await updateSourceTitle(input.sourceId, input.title.trim())
    }

    if (input.aiUsageAllowed !== undefined) {
      await updateSourceAiUsage(input.sourceId, input.aiUsageAllowed)
    }

    if (input.sourceStatus !== undefined) {
      await updateSourceStatus(input.sourceId, input.sourceStatus)
    }

    const updated = await findSourceById(input.sourceId)
    if (!updated) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }

    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重新解析资料
export async function reparseSource(
  sourceId: string,
): Promise<ServiceResult<void>> {
  try {
    const source = await findSourceById(sourceId)
    if (!source) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }

    if (!source.rawText) {
      return err({
        code: 'SOURCE_EMPTY_TEXT',
        message: '资料没有可解析的文本',
        retryable: false,
      })
    }

    await updateSourceProcessingStatus(sourceId, 'parsing', null)
    await deleteSourceChunks(sourceId)
    await createChunksFromParsed(sourceId, source.projectId, splitIntoChunks(source.rawText!))
    await updateSourceProcessingStatus(sourceId, 'ready', null)

    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除资料（软删除）
export async function deleteSource(
  sourceId: string,
): Promise<ServiceResult<void>> {
  try {
    const source = await findSourceById(sourceId)
    if (!source) {
      return err({
        code: NOT_FOUND,
        message: '资料不存在',
        retryable: false,
      })
    }

    await softDeleteSource(sourceId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部工具 ============

/// 纯文本分片(按双换行分割段落,每片最多 2000 字符)
/// 返回 ParsedChunk 数组(不写库),供 createChunksFromParsed 入库
/// txt/md/markdown 走此路径;PDF/Word 由 Rust 端返回分片,直接入库
function splitIntoChunks(text: string): ParsedChunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
  const chunks: ParsedChunk[] = []
  let currentChunk = ''
  const MAX_CHUNK_SIZE = 2000

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        pageNumber: null,
        startOffset: null,
        endOffset: null,
      })
      currentChunk = paragraph
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph
    }
  }

  // 写入最后一片
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      pageNumber: null,
      startOffset: null,
      endOffset: null,
    })
  }

  return chunks
}

/// 将分片数据写入 source_chunks 表
/// 供 importTextFile / importParsedFile / createTextSource / reparseSource 共用
async function createChunksFromParsed(
  sourceId: string,
  projectId: string,
  chunks: ParsedChunk[],
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    await insertSourceChunk({
      id: generateId(),
      projectId,
      sourceId,
      chunkIndex: i,
      content: chunks[i].content,
      tokenCount: estimateTokens(chunks[i].content),
      pageNumber: chunks[i].pageNumber,
      startOffset: chunks[i].startOffset,
      endOffset: chunks[i].endOffset,
    })
  }
}

/// 粗略估算 token 数（中文约 1 字 = 1 token，英文约 4 字符 = 1 token）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars + otherChars / 4)
}

/// 获取文件扩展名（含点）
function getExtension(filePath: string): string {
  const idx = filePath.lastIndexOf('.')
  return idx > 0 ? filePath.substring(idx) : ''
}

/// 获取文件基础名（含扩展名）
function getBaseName(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx >= 0 ? filePath.substring(idx + 1) : filePath
}

/// 根据扩展名获取 MIME 类型
function getMimeType(ext: string): string {
  switch (ext) {
    case '.txt':
      return 'text/plain'
    case '.md':
    case '.markdown':
      return 'text/markdown'
    case '.pdf':
      return 'application/pdf'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return 'application/octet-stream'
  }
}
