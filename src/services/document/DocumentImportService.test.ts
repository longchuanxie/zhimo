// DocumentImportService 单元测试
// 对应任务:项目从外部文档导入
//
// 覆盖链路:
// pickAndParseDocument:文件选择 → invoke 解析 → 错误映射
// createProjectFromDocument:创建项目 → 创建文档 → 写入正文(含失败不回滚 TD-IMPORT-03)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StructuredDoc, InferredProjectMeta, CreateProjectFromDocumentInput } from '@/types/projectImport'
import type { ServiceResult } from '@/types/service'
import type { Project, Document } from '@/types'

// ============ mock ============
// 用 vi.hoisted 确保 mock 引用在 vi.mock 工厂执行前已就绪
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  invoke: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  setDocumentInitialContent: vi.fn(),
  structuredDocToTipTap: vi.fn(() => ({ type: 'doc', content: [] })),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@/services/project/ProjectService', () => ({
  createProject: mocks.createProject,
  deleteProject: mocks.deleteProject,
}))
vi.mock('@/services/document/DocumentService', () => ({
  createDocument: mocks.createDocument,
  deleteDocument: mocks.deleteDocument,
  setDocumentInitialContent: mocks.setDocumentInitialContent,
}))
vi.mock('@/utils/tiptapConverters', () => ({ structuredDocToTipTap: mocks.structuredDocToTipTap }))

// 延迟导入,确保 mock 已注册
const { pickAndParseDocument, createProjectFromDocument } = await import('./DocumentImportService')

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

// ============ 测试夹具 ============

/// 构造合法 StructuredDoc
function makeStructuredDoc(overrides: Partial<StructuredDoc> = {}): StructuredDoc {
  return {
    format: 'markdown',
    nodes: [
      { kind: 'heading', level: 1, text: '测试标题' },
      { kind: 'paragraph', runs: [{ text: '测试正文', bold: false, italic: false }] },
    ],
    plainText: '测试标题\n测试正文',
    wordCount: 6,
    ...overrides,
  }
}

/// 构造合法 InferredProjectMeta
function makeInferredMeta(overrides: Partial<InferredProjectMeta> = {}): InferredProjectMeta {
  return {
    name: '测试项目',
    type: 'free_writing',
    description: '测试描述',
    writingGoal: '',
    targetReader: '',
    targetWordCount: 5000,
    ...overrides,
  }
}

/// 构造合法 CreateProjectFromDocumentInput
function makeInput(overrides: Partial<CreateProjectFromDocumentInput> = {}): CreateProjectFromDocumentInput {
  return {
    documentPath: '/path/to/file.md',
    structuredDoc: makeStructuredDoc(),
    meta: makeInferredMeta(),
    documentTitle: '正文',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // structuredDocToTipTap 默认返回最小合法 TipTap doc
  mocks.structuredDocToTipTap.mockReturnValue({ type: 'doc', content: [] })
  // 回滚方法默认成功(回滚失败由 safeRollback 静默处理,测试不关注回滚本身的成败)
  mocks.deleteProject.mockResolvedValue({ ok: true, data: undefined } as ServiceResult<void>)
  mocks.deleteDocument.mockResolvedValue({ ok: true, data: undefined } as ServiceResult<void>)
})

// ============ 测试用例 ============

describe('pickAndParseDocument', () => {
  it('用户取消选择 → OPERATION_CANCELLED,不调 invoke', async () => {
    mocks.open.mockResolvedValue(null)

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('OPERATION_CANCELLED')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('成功选择 + 解析 → 返回 StructuredDoc', async () => {
    mocks.open.mockResolvedValue('/path/to/file.md')
    mocks.invoke.mockResolvedValue(makeStructuredDoc())

    const doc = unwrap(await pickAndParseDocument())

    expect(doc.format).toBe('markdown')
    expect(doc.nodes).toHaveLength(2)
    expect(mocks.invoke).toHaveBeenCalledWith('parse_document_structured', { filePath: '/path/to/file.md' })
  })

  it('invoke 抛 "DOCUMENT_FORMAT_UNSUPPORTED: .xxx" → 映射为相同错误码(retryable: false)', async () => {
    mocks.open.mockResolvedValue('/path/to/file.xyz')
    mocks.invoke.mockRejectedValue('DOCUMENT_FORMAT_UNSUPPORTED: .xyz')

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('DOCUMENT_FORMAT_UNSUPPORTED')
    expect(error.retryable).toBe(false)
  })

  it('invoke 抛 "SOURCE_OCR_REQUIRED" → 映射为相同错误码', async () => {
    mocks.open.mockResolvedValue('/path/to/scan.pdf')
    mocks.invoke.mockRejectedValue('SOURCE_OCR_REQUIRED')

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('SOURCE_OCR_REQUIRED')
    expect(error.retryable).toBe(false)
  })

  it('invoke 抛其他字符串 → DOCUMENT_IMPORT_FAILED(retryable: true)', async () => {
    mocks.open.mockResolvedValue('/path/to/file.md')
    mocks.invoke.mockRejectedValue('某个未知错误')

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('DOCUMENT_IMPORT_FAILED')
    expect(error.retryable).toBe(true)
  })

  it('解析结果 nodes 为空 → DOCUMENT_EMPTY_CONTENT', async () => {
    mocks.open.mockResolvedValue('/path/to/empty.md')
    mocks.invoke.mockResolvedValue(makeStructuredDoc({ nodes: [], plainText: '' }))

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('DOCUMENT_EMPTY_CONTENT')
  })

  it('解析结果 plainText 为空白 → DOCUMENT_EMPTY_CONTENT', async () => {
    mocks.open.mockResolvedValue('/path/to/whitespace.md')
    mocks.invoke.mockResolvedValue(makeStructuredDoc({ plainText: '   \n  ' }))

    const error = unwrapErr(await pickAndParseDocument())

    expect(error.code).toBe('DOCUMENT_EMPTY_CONTENT')
  })
})

describe('createProjectFromDocument', () => {
  it('完整流程成功 → 返回 { projectId, documentId },按顺序调用三步', async () => {
    const fakeProject = { id: 'proj-1' } as Project
    const fakeDocument = { id: 'doc-1' } as Document
    mocks.createProject.mockResolvedValue({ ok: true, data: fakeProject } as ServiceResult<Project>)
    mocks.createDocument.mockResolvedValue({ ok: true, data: fakeDocument } as ServiceResult<Document>)
    mocks.setDocumentInitialContent.mockResolvedValue({ ok: true, data: undefined } as ServiceResult<void>)

    const result = unwrap(await createProjectFromDocument(makeInput()))

    expect(result.projectId).toBe('proj-1')
    expect(result.documentId).toBe('doc-1')
    // 验证调用顺序:先 createProject,再 createDocument,最后 setDocumentInitialContent
    expect(mocks.createProject).toHaveBeenCalledTimes(1)
    expect(mocks.createDocument).toHaveBeenCalledTimes(1)
    expect(mocks.setDocumentInitialContent).toHaveBeenCalledTimes(1)
    expect(mocks.structuredDocToTipTap).toHaveBeenCalledTimes(1)
    // setDocumentInitialContent 应收到 TipTap JSON + plainText + wordCount
    const initArg = mocks.setDocumentInitialContent.mock.calls[0][0]
    expect(initArg.documentId).toBe('doc-1')
    expect(initArg.contentJson).toEqual({ type: 'doc', content: [] })
    expect(initArg.plainText).toBe('测试标题\n测试正文')
    expect(initArg.wordCount).toBe(6)
  })

  it('documentTitle 为空时使用默认标题 IMPORT_DEFAULT_DOCUMENT_TITLE', async () => {
    mocks.createProject.mockResolvedValue({ ok: true, data: { id: 'proj-1' } as Project } as ServiceResult<Project>)
    mocks.createDocument.mockResolvedValue({ ok: true, data: { id: 'doc-1' } as Document } as ServiceResult<Document>)
    mocks.setDocumentInitialContent.mockResolvedValue({ ok: true, data: undefined } as ServiceResult<void>)

    await createProjectFromDocument(makeInput({ documentTitle: '   ' }))

    const createDocArg = mocks.createDocument.mock.calls[0][0]
    expect(createDocArg.title).toBe('正文')
  })

  it('createProject 失败 → 透传错误,不调 createDocument/setDocumentInitialContent', async () => {
    mocks.createProject.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '名称不能为空', retryable: false },
    } as ServiceResult<Project>)

    const error = unwrapErr(await createProjectFromDocument(makeInput()))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(mocks.createDocument).not.toHaveBeenCalled()
    expect(mocks.setDocumentInitialContent).not.toHaveBeenCalled()
    expect(mocks.structuredDocToTipTap).not.toHaveBeenCalled()
  })

  it('createDocument 失败 → 透传错误,回滚 deleteProject', async () => {
    mocks.createProject.mockResolvedValue({ ok: true, data: { id: 'proj-1' } as Project } as ServiceResult<Project>)
    mocks.createDocument.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '标题不能为空', retryable: false },
    } as ServiceResult<Document>)

    const error = unwrapErr(await createProjectFromDocument(makeInput()))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(mocks.setDocumentInitialContent).not.toHaveBeenCalled()
    expect(mocks.structuredDocToTipTap).not.toHaveBeenCalled()
    // 回滚:删除已创建的项目
    expect(mocks.deleteProject).toHaveBeenCalledWith('proj-1')
    expect(mocks.deleteDocument).not.toHaveBeenCalled()
  })

  it('setDocumentInitialContent 失败 → 透传错误,回滚 deleteDocument + deleteProject', async () => {
    mocks.createProject.mockResolvedValue({ ok: true, data: { id: 'proj-1' } as Project } as ServiceResult<Project>)
    mocks.createDocument.mockResolvedValue({ ok: true, data: { id: 'doc-1' } as Document } as ServiceResult<Document>)
    mocks.setDocumentInitialContent.mockResolvedValue({
      ok: false,
      error: { code: 'DOCUMENT_NOT_FOUND', message: '文档不存在', retryable: false },
    } as ServiceResult<void>)

    const error = unwrapErr(await createProjectFromDocument(makeInput()))

    expect(error.code).toBe('DOCUMENT_NOT_FOUND')
    // 回滚:先删文档,再删项目
    expect(mocks.deleteDocument).toHaveBeenCalledWith('doc-1')
    expect(mocks.deleteProject).toHaveBeenCalledWith('proj-1')
  })

  it('回滚本身失败时静默忽略,保留原始错误', async () => {
    mocks.createProject.mockResolvedValue({ ok: true, data: { id: 'proj-1' } as Project } as ServiceResult<Project>)
    mocks.createDocument.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '标题不能为空', retryable: false },
    } as ServiceResult<Document>)
    // 回滚失败
    mocks.deleteProject.mockRejectedValue(new Error('网络错误'))

    const error = unwrapErr(await createProjectFromDocument(makeInput()))

    // 保留原始错误,不被回滚错误掩盖
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('标题不能为空')
  })
})
