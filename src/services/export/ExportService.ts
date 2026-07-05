// 导出 Service
// 对应文档：06_工程实施补齐/03_本地Service接口详细规格_v1.0.md §12
//
// 职责：
// - 创建导出任务并执行导出
// - 支持 Markdown / TXT / Word / LaTeX / DOCX 五种格式
// - 支持整项目 / 当前文档 / 大纲范围三种范围
// - LaTeX/DOCX 导出前检查 orphan_citation 阻断(材料真实性保障)
// - 失败可重试
//
// 架构约束：
// - 通过 fileGateway 写入文件(writeText/writeBinary)
// - 通过 documentRepository / outlineRepository 查询内容
// - 通过 PaperService 收集论文元数据 + 完整性检查
// - 不直接暴露数据库错误给 UI

import type {
  ExportTask,
  ExportScope,
  ExportFormat,
  ExportOptions,
  Document,
  Figure,
  Equation,
  Citation,
  Reference,
} from '@/types'
import type { JSONContent } from '@tiptap/react'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  EXPORT_NO_DOCUMENT,
  EXPORT_FAILED,
  EXPORT_LATEX_FAILED,
  EXPORT_DOCX_FAILED,
  CITATION_ORPHAN,
  NOT_FOUND,
} from '@/constants/errors'
import {
  insertExportTask,
  findExportTaskById,
  listExportTasksByProject,
  updateExportTaskStatus,
  updateExportTaskFilePath,
} from '@/services/database/exportRepository'
import {
  findDocumentById,
  listDocuments,
} from '@/services/database/documentRepository'
import {
  findOutlineNodeById,
} from '@/services/database/outlineRepository'
import { findProjectById } from '@/services/database/projectRepository'
import { writeText, writeBinary, joinPath } from '@/services/file/fileGateway'
import { getProjectExportsDir } from '@/services/file/pathUtil'
import {
  checkIntegrity,
  getReferencesForExport,
  getFiguresForExport,
  getEquationsForExport,
} from '@/services/paper/PaperService'
import { listCitationsByDocumentId } from '@/services/citation/CitationService'
import { exportToLatex } from './LatexExporter'
import { exportToDocx } from './DocxExporter'

// ============ 默认导出选项 ============

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  citationStyle: 'gbt7714_2015',
  includeFigures: true,
  includeTOC: false,
  fontFamily: '宋体',
  fontSize: 12,
  lineHeight: 1.5,
  margin: { top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
}

// ============ 类型定义 ============

export type CreateExportTaskInput = {
  projectId: string
  exportScope: ExportScope
  exportFormat: ExportFormat
  documentIds?: string[]
  outlineNodeIds?: string[]
  /// 用户指定的导出目录（为空时使用项目默认导出目录）
  targetDirectory?: string
  /// 导出高级选项(字体/字号/行距/页边距/引用格式等)
  exportOptions?: ExportOptions
}

// ============ Service 方法 ============

/// 创建并执行导出任务
export async function createExportTask(
  input: CreateExportTaskInput,
): Promise<ServiceResult<ExportTask>> {
  try {
    // 1. 校验项目存在
    const project = await findProjectById(input.projectId)
    if (!project) {
      return err({ code: NOT_FOUND, message: '项目不存在', retryable: false })
    }

    // 2. 创建任务记录
    const task = await insertExportTask({
      projectId: input.projectId,
      exportScope: input.exportScope,
      exportFormat: input.exportFormat,
      documentIds: input.documentIds ?? null,
      outlineNodeIds: input.outlineNodeIds ?? null,
      exportOptions: input.exportOptions ?? null,
    })

    // 3. 执行导出（MVP 同步执行）
    const result = await executeExport(task, input.targetDirectory)
    return ok(result)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 列出项目的导出任务
export async function listExportTasks(
  projectId: string,
): Promise<ServiceResult<ExportTask[]>> {
  try {
    const tasks = await listExportTasksByProject(projectId)
    return ok(tasks)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 获取导出任务详情
export async function getExportTask(
  taskId: string,
): Promise<ServiceResult<ExportTask>> {
  try {
    const task = await findExportTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '导出任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重试导出任务
export async function retryExportTask(
  taskId: string,
): Promise<ServiceResult<ExportTask>> {
  try {
    const task = await findExportTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '导出任务不存在',
        retryable: false,
      })
    }

    // 重置状态为 pending
    await updateExportTaskStatus(taskId, 'pending', null, null)

    // 重新执行
    const result = await executeExport({ ...task, status: 'pending' })
    return ok(result)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 取消导出任务
export async function cancelExportTask(
  taskId: string,
): Promise<ServiceResult<ExportTask>> {
  try {
    await updateExportTaskStatus(taskId, 'cancelled', null, null)
    const task = await findExportTaskById(taskId)
    if (!task) {
      return err({
        code: NOT_FOUND,
        message: '导出任务不存在',
        retryable: false,
      })
    }
    return ok(task)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 内部实现 ============

/// 导出内容生成结果
type GeneratedContent = {
  /// 文本内容(markdown/txt/word/latex)或二进制内容(docx)
  content: string | Uint8Array
  /// 文件扩展名
  extension: string
  /// 是否为二进制
  binary: boolean
}

/// 执行导出
async function executeExport(
  task: ExportTask,
  targetDirectory?: string,
): Promise<ExportTask> {
  try {
    // 1. 收集文档
    const documents = await collectDocuments(task)
    if (documents.length === 0) {
      await updateExportTaskStatus(
        task.id,
        'failed',
        EXPORT_NO_DOCUMENT,
        '没有可导出的文档',
      )
      const failed = await findExportTaskById(task.id)
      return failed!
    }

    // 2. 论文格式(latex/docx)导出前检查 orphan_citation 阻断
    if (task.exportFormat === 'latex' || task.exportFormat === 'docx') {
      const blocked = await checkOrphanCitationBlock(task.id, documents)
      if (blocked) {
        const failedTask = await findExportTaskById(task.id)
        return failedTask!
      }
    }

    // 3. 生成文件内容
    const generated = await generateContent(task, documents)

    // 4. 写入文件
    const exportsDir = targetDirectory
      ? targetDirectory
      : await getProjectExportsDir(task.projectId)
    const fileName = `export-${task.id}.${generated.extension}`
    const filePath = await joinPath(exportsDir, fileName)

    if (generated.binary) {
      await writeBinary(filePath, generated.content as Uint8Array)
    } else {
      await writeText(filePath, generated.content as string)
    }

    // 5. 更新任务状态为成功
    await updateExportTaskFilePath(task.id, filePath)
    await updateExportTaskStatus(task.id, 'succeeded', null, null)

    const succeeded = await findExportTaskById(task.id)
    return succeeded!
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const errorCode = getExportErrorCode(task.exportFormat)
    await updateExportTaskStatus(
      task.id,
      'failed',
      errorCode,
      message,
    )
    const failed = await findExportTaskById(task.id)
    return failed!
  }
}

/// 检查 orphan_citation 阻断(材料真实性保障)
/// 若任何文档存在 orphan_citation,标记任务失败并返回 true
async function checkOrphanCitationBlock(
  taskId: string,
  documents: Document[],
): Promise<boolean> {
  for (const doc of documents) {
    const integrityResult = await checkIntegrity(doc.id)
    if (integrityResult.ok) {
      const hasOrphan = integrityResult.data.some(
        (issue) => issue.type === 'orphan_citation',
      )
      if (hasOrphan) {
        await updateExportTaskStatus(
          taskId,
          'failed',
          CITATION_ORPHAN,
          `文档「${doc.title}」存在悬空引文(关联的参考文献已删除),请先修复后再导出`,
        )
        return true
      }
    }
  }
  return false
}

/// 根据导出范围收集文档
async function collectDocuments(task: ExportTask): Promise<Document[]> {
  if (task.exportScope === 'current_document') {
    const ids = task.documentIds ?? []
    const docs: Document[] = []
    for (const id of ids) {
      const doc = await findDocumentById(id)
      if (doc && !doc.isDeleted) docs.push(doc)
    }
    return docs
  }

  if (task.exportScope === 'outline_scope') {
    // 按大纲节点顺序收集关联文档
    const nodeIds = task.outlineNodeIds ?? []
    const docs: Document[] = []
    for (const nodeId of nodeIds) {
      const node = await findOutlineNodeById(nodeId)
      if (node?.linkedDocumentId) {
        const doc = await findDocumentById(node.linkedDocumentId)
        if (doc && !doc.isDeleted) docs.push(doc)
      }
    }
    return docs
  }

  // whole_project：查询项目所有未删除文档，按创建时间排序
  const allDocs = await listDocuments(task.projectId)
  return allDocs.filter((d) => !d.isDeleted)
}

/// 生成导出内容
async function generateContent(
  task: ExportTask,
  documents: Document[],
): Promise<GeneratedContent> {
  if (task.exportFormat === 'markdown') {
    return { content: generateMarkdown(documents), extension: 'md', binary: false }
  }

  if (task.exportFormat === 'txt') {
    return { content: generatePlainText(documents), extension: 'txt', binary: false }
  }

  if (task.exportFormat === 'word') {
    // 生成 HTML 格式的 .doc 文件（Word 可打开）
    return { content: generateWordHtml(documents), extension: 'doc', binary: false }
  }

  if (task.exportFormat === 'latex') {
    const latex = await generateLatex(task, documents)
    return { content: latex, extension: 'tex', binary: false }
  }

  if (task.exportFormat === 'docx') {
    const docx = await generateDocx(task, documents)
    return { content: docx, extension: 'docx', binary: true }
  }

  throw new Error(`不支持的导出格式：${task.exportFormat}`)
}

/// 生成 LaTeX 内容(多文档合并)
async function generateLatex(
  task: ExportTask,
  documents: Document[],
): Promise<string> {
  const options = task.exportOptions ?? DEFAULT_EXPORT_OPTIONS
  const merged = await mergeDocumentsForExport(documents)
  const title = documents.length === 1 ? documents[0]!.title : '导出文档'

  return exportToLatex({
    title,
    content: merged.content,
    references: merged.references,
    figures: merged.figures,
    equations: merged.equations,
    citations: merged.citations,
    options,
  })
}

/// 生成 DOCX 二进制(多文档合并)
async function generateDocx(
  task: ExportTask,
  documents: Document[],
): Promise<Uint8Array> {
  const options = task.exportOptions ?? DEFAULT_EXPORT_OPTIONS
  const merged = await mergeDocumentsForExport(documents)
  const title = documents.length === 1 ? documents[0]!.title : '导出文档'

  return exportToDocx({
    title,
    content: merged.content,
    references: merged.references,
    figures: merged.figures,
    equations: merged.equations,
    citations: merged.citations,
    options,
  })
}

/// 合并多文档内容 + 聚合论文元数据(参考文献/图表/公式/引文)
async function mergeDocumentsForExport(
  documents: Document[],
): Promise<{
  content: JSONContent
  references: Reference[]
  figures: Figure[]
  equations: Equation[]
  citations: Citation[]
}> {
  const allChildren: JSONContent[] = []
  const referencesMap = new Map()
  const figures: Figure[] = []
  const equations: Equation[] = []
  const citations: Citation[] = []

  for (const doc of documents) {
    // 文档标题作为分隔标题
    allChildren.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: doc.title }],
    })

    // 文档内容
    const docContent = doc.contentJson as JSONContent | null
    if (docContent?.content) {
      allChildren.push(...docContent.content)
    }

    // 聚合论文元数据
    const [refsResult, figsResult, eqsResult, citesResult] = await Promise.all([
      getReferencesForExport(doc.id),
      getFiguresForExport(doc.id),
      getEquationsForExport(doc.id),
      listCitationsByDocumentId(doc.id),
    ])

    if (refsResult.ok) {
      for (const ref of refsResult.data) {
        referencesMap.set(ref.id, ref)
      }
    }
    if (figsResult.ok) figures.push(...figsResult.data)
    if (eqsResult.ok) equations.push(...eqsResult.data)
    if (citesResult.ok) citations.push(...citesResult.data)
  }

  return {
    content: { type: 'doc', content: allChildren },
    references: Array.from(referencesMap.values()),
    figures,
    equations,
    citations,
  }
}

/// 生成 Markdown 内容
function generateMarkdown(documents: Document[]): string {
  const parts: string[] = []

  for (const doc of documents) {
    parts.push(`# ${doc.title}\n`)
    if (doc.summary) {
      parts.push(`> ${doc.summary}\n`)
    }
    parts.push(doc.plainText || '')
    parts.push('\n---\n')
  }

  return parts.join('\n').trim()
}

/// 生成 TXT 纯文本内容
function generatePlainText(documents: Document[]): string {
  const parts: string[] = []

  for (const doc of documents) {
    const docParts = [doc.title.trim()]
    if (doc.summary?.trim()) {
      docParts.push(doc.summary.trim())
    }
    if (doc.plainText?.trim()) {
      docParts.push(doc.plainText.trim())
    }
    parts.push(docParts.join('\n\n'))
  }

  return parts.join('\n\n\n').trim()
}

/// 生成 Word 兼容的 HTML 内容
function generateWordHtml(documents: Document[]): string {
  const bodyParts: string[] = []

  for (const doc of documents) {
    bodyParts.push(`<h1>${escapeHtml(doc.title)}</h1>`)
    if (doc.summary) {
      bodyParts.push(`<blockquote>${escapeHtml(doc.summary)}</blockquote>`)
    }
    // 将纯文本按换行符转为段落
    const text = doc.plainText || ''
    const paragraphs = text.split(/\n+/).filter(Boolean)
    for (const p of paragraphs) {
      bodyParts.push(`<p>${escapeHtml(p)}</p>`)
    }
    bodyParts.push('<hr/>')
  }

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>导出文档</title>
<style>
body { font-family: "宋体", SimSun, serif; font-size: 12pt; line-height: 1.6; }
h1 { font-size: 18pt; margin-top: 24pt; }
blockquote { color: #666; border-left: 3px solid #ccc; padding-left: 12px; }
hr { border: none; border-top: 1px solid #ccc; margin: 24px 0; }
</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`
}

/// HTML 转义
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getExportErrorCode(format: ExportFormat): string {
  if (format === 'latex') return EXPORT_LATEX_FAILED
  if (format === 'docx') return EXPORT_DOCX_FAILED
  return EXPORT_FAILED
}
