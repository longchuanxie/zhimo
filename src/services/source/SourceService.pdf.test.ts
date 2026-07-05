// SourceService PDF/Word 导入单元测试
// 对应任务:#2 PDF/Word 解析
//
// 覆盖链路:
// importFile → 分流(importParsedFile / importTextFile)
//   ├─ PDF/Word:open → copyFileTo → parseSourceFile(invoke) → 状态流转 → 入库
//   └─ txt/md:open → readText → 入库
//
// 关键 mock:
// - @tauri-apps/plugin-dialog.open(配置文件选择结果)
// - @tauri-apps/api/core.invoke(配置 Rust 端 parse_source_file 返回值或抛错)
// - @tauri-apps/plugin-fs.readTextFile(配置文本文件内容)
// - @tauri-apps/api/path(join / appDataDir,提供路径拼接)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { seedTable } from '@/test/fixtures/sqlMock'
import { select } from '@/services/database/db'
import type { ServiceResult } from '@/types/service'
import type { ParsedSource } from '@/types'
import { importFile } from './SourceService'

// ============ mock @tauri-apps/api/path ============
// setup.ts 未 mock 此模块,测试文件内单独 mock
vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn(async (...segments: string[]) => segments.join('/')),
  appDataDir: vi.fn(async () => '/mock/appdata'),
  appConfigDir: vi.fn(async () => '/mock/appconfig'),
  sep: vi.fn(() => '/'),
}))

// ============ 测试工具 ============

/// 解包 ServiceResult,断言成功并返回 data
function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result but got error: ${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

/// 解包 ServiceResult,断言失败并返回 error
function unwrapErr<T>(result: ServiceResult<T>) {
  if (result.ok) {
    throw new Error(`Expected error result but got ok: ${JSON.stringify(result.data)}`)
  }
  return result.error
}

/// 构造 PDF 解析成功结果
function makePdfParsed(overrides: Partial<ParsedSource> = {}): ParsedSource {
  return {
    text: 'PDF 全文内容',
    pageCount: 1,
    chunks: [
      { content: 'PDF 全文内容', pageNumber: 1, startOffset: 0, endOffset: 7 },
    ],
    sourceType: 'pdf',
    ocrUsed: false,
    ...overrides,
  }
}

/// 构造 Word 解析成功结果
function makeWordParsed(overrides: Partial<ParsedSource> = {}): ParsedSource {
  return {
    text: 'Word 全文内容',
    pageCount: 1,
    chunks: [
      { content: 'Word 全文内容', pageNumber: null, startOffset: 0, endOffset: 7 },
    ],
    sourceType: 'word',
    ocrUsed: false,
    ...overrides,
  }
}

/// 查询 sources 表所有记录
async function listSourcesFromDb(): Promise<Array<Record<string, unknown>>> {
  return select('SELECT * FROM sources', [])
}

/// 查询 source_chunks 表所有记录
async function listChunksFromDb(): Promise<Array<Record<string, unknown>>> {
  return select('SELECT * FROM source_chunks', [])
}

// ============ 测试夹具 ============

const DEFAULT_PROJECT_ID = 'p1'

/// 初始化 sources / source_chunks 空表
/// sqlMock 的 CREATE TABLE 不会自动建表,需要 INSERT 隐式创建
/// 此处通过 seedTable 建立 schema 与空记录
function seedEmptyTables() {
  seedTable('sources', [])
  seedTable('source_chunks', [])
}

// ============ 测试 ============

describe('SourceService PDF/Word 导入(#2 PDF/Word 解析)', () => {
  beforeEach(() => {
    // 每个测试前清除 mock 调用历史(保留 setup.ts 的默认实现)
    vi.mocked(open).mockClear()
    vi.mocked(invoke).mockClear()
    vi.mocked(readTextFile).mockClear()

    // 初始化空表
    seedEmptyTables()
  })

  // ---------- 用例 1:PDF 文本型导入成功路径 ----------
  it('PDF 文本型导入:成功写入 sources + source_chunks,状态 ready', async () => {
    vi.mocked(open).mockResolvedValue('/data/test.pdf' as never)
    vi.mocked(invoke).mockResolvedValue(makePdfParsed({
      text: '第一页内容\n\n第二页内容',
      pageCount: 2,
      chunks: [
        { content: '第一页内容', pageNumber: 1, startOffset: 0, endOffset: 5 },
        { content: '第二页内容', pageNumber: 2, startOffset: 6, endOffset: 11 },
      ],
    }))

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID, aiUsageAllowed: true })
    const source = unwrap(result)

    // 断言返回的 source
    expect(source.type).toBe('pdf')
    expect(source.processingStatus).toBe('ready')
    expect(source.title).toBe('test.pdf')
    expect(source.aiUsageAllowed).toBe(true)
    expect(source.fileUrl).toContain('test.pdf')

    // 断言数据库写入:1 条 source,2 条 chunk
    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.processing_status).toBe('ready')
    expect(sources[0]!.type).toBe('pdf')
    expect(sources[0]!.raw_text).toBe('第一页内容\n\n第二页内容')

    const chunks = await listChunksFromDb()
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.chunk_index).toBe(0)
    expect(chunks[0]!.page_number).toBe(1)
    expect(chunks[1]!.chunk_index).toBe(1)
    expect(chunks[1]!.page_number).toBe(2)

    // 断言 invoke 被调用,参数正确
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('parse_source_file', {
      filePath: expect.stringContaining('test.pdf'),
      enableOcr: true,
    })
  })

  // ---------- 用例 2:docx 导入成功路径 ----------
  it('docx 导入:成功写入 sources + source_chunks,type=word', async () => {
    vi.mocked(open).mockResolvedValue('/data/report.docx' as never)
    vi.mocked(invoke).mockResolvedValue(makeWordParsed({
      text: '段落一\n\n段落二',
      chunks: [
        { content: '段落一\n\n段落二', pageNumber: null, startOffset: 0, endOffset: 9 },
      ],
    }))

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const source = unwrap(result)

    expect(source.type).toBe('word')
    expect(source.processingStatus).toBe('ready')
    expect(source.title).toBe('report.docx')
    expect(source.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.type).toBe('word')

    const chunks = await listChunksFromDb()
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.page_number).toBeNull()
  })

  // ---------- 用例 3:PDF 扫描版返回 SOURCE_OCR_REQUIRED ----------
  it('PDF 扫描版:返回 SOURCE_OCR_REQUIRED,状态 failed', async () => {
    vi.mocked(open).mockResolvedValue('/data/scanned.pdf' as never)
    // Rust 端返回错误码字符串
    vi.mocked(invoke).mockRejectedValue(new Error('SOURCE_OCR_REQUIRED'))

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const error = unwrapErr(result)

    expect(error.code).toBe('SOURCE_OCR_REQUIRED')
    expect(error.retryable).toBe(false)

    // 断言数据库状态:failed + error_message
    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.processing_status).toBe('failed')
    expect(String(sources[0]!.error_message)).toContain('SOURCE_OCR_REQUIRED')

    // 不应写入 chunks
    const chunks = await listChunksFromDb()
    expect(chunks).toHaveLength(0)
  })

  // ---------- 用例 4:PDF 解析失败(非 OCR 错误) ----------
  it('PDF 解析失败:返回 SOURCE_PARSE_FAILED,状态 failed', async () => {
    vi.mocked(open).mockResolvedValue('/data/broken.pdf' as never)
    vi.mocked(invoke).mockRejectedValue(new Error('PDF 文本提取失败: 文件损坏'))

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const error = unwrapErr(result)

    expect(error.code).toBe('SOURCE_PARSE_FAILED')
    expect(error.retryable).toBe(true)
    expect(error.message).toContain('文件损坏')

    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.processing_status).toBe('failed')
  })

  // ---------- 用例 5:解析结果为空文本 ----------
  it('PDF 解析结果为空:返回 SOURCE_EMPTY_TEXT,状态 failed', async () => {
    vi.mocked(open).mockResolvedValue('/data/blank.pdf' as never)
    vi.mocked(invoke).mockResolvedValue(makePdfParsed({
      text: '   ',
      pageCount: 1,
      chunks: [],
    }))

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const error = unwrapErr(result)

    expect(error.code).toBe('SOURCE_EMPTY_TEXT')
    expect(error.retryable).toBe(false)

    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.processing_status).toBe('failed')
  })

  // ---------- 用例 6:txt 文件仍走原流程(回归保护) ----------
  it('txt 导入:不调用 invoke,走 readText 原流程', async () => {
    vi.mocked(open).mockResolvedValue('/data/notes.txt' as never)
    vi.mocked(readTextFile).mockResolvedValue('Hello World')

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const source = unwrap(result)

    expect(source.type).toBe('txt')
    expect(source.processingStatus).toBe('ready')
    expect(source.rawText).toBe('Hello World')

    // 关键回归:txt 不应调用 Rust 端 invoke
    expect(invoke).not.toHaveBeenCalled()

    // 但应该调用了 readTextFile
    expect(readTextFile).toHaveBeenCalledWith('/data/notes.txt')

    // 数据库写入:1 条 source,1 条 chunk(内容 < 2000 字符,单分片)
    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.type).toBe('txt')
    expect(sources[0]!.raw_text).toBe('Hello World')

    const chunks = await listChunksFromDb()
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.content).toBe('Hello World')
  })

  // ---------- 用例 7:用户取消文件选择 ----------
  it('用户取消:返回 OPERATION_CANCELLED,不调用 invoke,无数据库写入', async () => {
    vi.mocked(open).mockResolvedValue(null)

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const error = unwrapErr(result)

    expect(error.code).toBe('OPERATION_CANCELLED')

    expect(invoke).not.toHaveBeenCalled()

    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(0)
  })

  // ---------- 用例 8:不支持的文件类型 ----------
  it('不支持的文件类型:返回 FILE_TYPE_UNSUPPORTED,不调用 invoke', async () => {
    vi.mocked(open).mockResolvedValue('/data/data.xls' as never)

    const result = await importFile({ projectId: DEFAULT_PROJECT_ID })
    const error = unwrapErr(result)

    expect(error.code).toBe('FILE_TYPE_UNSUPPORTED')

    expect(invoke).not.toHaveBeenCalled()

    const sources = await listSourcesFromDb()
    expect(sources).toHaveLength(0)
  })
})
