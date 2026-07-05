import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Document, ExportTask } from '@/types'

const insertExportTaskMock = vi.fn()
const findExportTaskByIdMock = vi.fn()
const listExportTasksByProjectMock = vi.fn()
const updateExportTaskStatusMock = vi.fn()
const updateExportTaskFilePathMock = vi.fn()
const findProjectByIdMock = vi.fn()
const findDocumentByIdMock = vi.fn()
const listDocumentsMock = vi.fn()
const findOutlineNodeByIdMock = vi.fn()
const writeTextMock = vi.fn()
const writeBinaryMock = vi.fn()
const joinPathMock = vi.fn()
const getProjectExportsDirMock = vi.fn()
const checkIntegrityMock = vi.fn()
const getReferencesForExportMock = vi.fn()
const getFiguresForExportMock = vi.fn()
const getEquationsForExportMock = vi.fn()
const listCitationsByDocumentIdMock = vi.fn()

vi.mock('@/services/database/exportRepository', () => ({
  insertExportTask: (...args: unknown[]) => insertExportTaskMock(...args),
  findExportTaskById: (...args: unknown[]) => findExportTaskByIdMock(...args),
  listExportTasksByProject: (...args: unknown[]) =>
    listExportTasksByProjectMock(...args),
  updateExportTaskStatus: (...args: unknown[]) =>
    updateExportTaskStatusMock(...args),
  updateExportTaskFilePath: (...args: unknown[]) =>
    updateExportTaskFilePathMock(...args),
}))

vi.mock('@/services/database/projectRepository', () => ({
  findProjectById: (...args: unknown[]) => findProjectByIdMock(...args),
}))

vi.mock('@/services/database/documentRepository', () => ({
  findDocumentById: (...args: unknown[]) => findDocumentByIdMock(...args),
  listDocuments: (...args: unknown[]) => listDocumentsMock(...args),
}))

vi.mock('@/services/database/outlineRepository', () => ({
  findOutlineNodeById: (...args: unknown[]) => findOutlineNodeByIdMock(...args),
}))

vi.mock('@/services/file/fileGateway', () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
  writeBinary: (...args: unknown[]) => writeBinaryMock(...args),
  joinPath: (...args: unknown[]) => joinPathMock(...args),
}))

vi.mock('@/services/file/pathUtil', () => ({
  getProjectExportsDir: (...args: unknown[]) => getProjectExportsDirMock(...args),
}))

vi.mock('@/services/paper/PaperService', () => ({
  checkIntegrity: (...args: unknown[]) => checkIntegrityMock(...args),
  getReferencesForExport: (...args: unknown[]) => getReferencesForExportMock(...args),
  getFiguresForExport: (...args: unknown[]) => getFiguresForExportMock(...args),
  getEquationsForExport: (...args: unknown[]) => getEquationsForExportMock(...args),
}))

vi.mock('@/services/citation/CitationService', () => ({
  listCitationsByDocumentId: (...args: unknown[]) =>
    listCitationsByDocumentIdMock(...args),
}))

const { createExportTask } = await import('./ExportService')

function makeTask(overrides: Partial<ExportTask> = {}): ExportTask {
  return {
    id: 'export-1',
    projectId: 'project-1',
    exportScope: 'current_document',
    exportFormat: 'txt',
    documentIds: ['doc-1'],
    outlineNodeIds: [],
    exportOptions: null,
    filePath: null,
    status: 'pending',
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    projectId: 'project-1',
    title: '第一集 暑假第一天',
    type: 'chapter',
    contentJson: null,
    plainText: '妈妈问：“为什么叫暑假？”\n小樱桃认真想了想。',
    wordCount: 27,
    outlineNodeId: null,
    status: 'draft',
    summary: '关于暑假的开场对话',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    citationStyle: 'gbt7714_2015',
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const pendingTask = makeTask()
  const succeededTask = makeTask({
    status: 'succeeded',
    filePath: 'D:/exports/export-export-1.txt',
    completedAt: '2026-01-01T00:00:01.000Z',
  })

  findProjectByIdMock.mockResolvedValue({ id: 'project-1' })
  insertExportTaskMock.mockResolvedValue(pendingTask)
  findExportTaskByIdMock.mockResolvedValue(succeededTask)
  findDocumentByIdMock.mockResolvedValue(makeDocument())
  listDocumentsMock.mockResolvedValue([])
  findOutlineNodeByIdMock.mockResolvedValue(null)
  getProjectExportsDirMock.mockResolvedValue('D:/exports')
  joinPathMock.mockImplementation(async (...parts: string[]) => parts.join('/'))
  writeTextMock.mockResolvedValue(undefined)
  writeBinaryMock.mockResolvedValue(undefined)
  updateExportTaskStatusMock.mockResolvedValue(undefined)
  updateExportTaskFilePathMock.mockResolvedValue(undefined)
  checkIntegrityMock.mockResolvedValue({ ok: true, data: [] })
  getReferencesForExportMock.mockResolvedValue({ ok: true, data: [] })
  getFiguresForExportMock.mockResolvedValue({ ok: true, data: [] })
  getEquationsForExportMock.mockResolvedValue({ ok: true, data: [] })
  listCitationsByDocumentIdMock.mockResolvedValue({ ok: true, data: [] })
})

describe('ExportService', () => {
  it('exports selected documents as plain TXT', async () => {
    const result = await createExportTask({
      projectId: 'project-1',
      exportScope: 'current_document',
      exportFormat: 'txt',
      documentIds: ['doc-1'],
    })

    expect(result.ok).toBe(true)
    expect(insertExportTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportFormat: 'txt' }),
    )
    expect(writeTextMock).toHaveBeenCalledWith(
      'D:/exports/export-export-1.txt',
      expect.stringContaining('第一集 暑假第一天'),
    )

    const exportedText = writeTextMock.mock.calls[0]![1] as string
    expect(exportedText).toContain('关于暑假的开场对话')
    expect(exportedText).toContain('妈妈问：“为什么叫暑假？”')
    expect(exportedText).not.toContain('# 第一集')
    expect(exportedText).not.toContain('---')
  })
})
