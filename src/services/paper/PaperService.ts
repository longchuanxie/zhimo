// 论文写作协调 Service
// 作为协调层,聚合各子 Service 的结果,提供文档论文元数据 + 完整性检查 + 导出元数据收集
//
// 架构约束:
// - 不直接访问 DB(除 documentRepository 查 wordCount,因 DocumentService.getDocument 返回完整文档对象过重)
// - 调用 CitationService / FigureService / EquationService / DocumentService
// - 返回 ServiceResult<T>
// - 完整性检查聚合:悬空引文 / 图表缺 caption / 图表缺 source / 公式 label 重复 / 公式 LaTeX 无效

import type {
  DocumentPaperMeta,
  IntegrityIssue,
  CitationStyle,
  Reference,
  Figure,
  Equation,
  EntityId,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import { NOT_FOUND } from '@/constants/errors'
import { findDocumentById } from '@/services/database/documentRepository'
import {
  checkOrphanCitations,
  generateBibliography,
  listDocumentReferences,
} from '@/services/citation/CitationService'
import { listFiguresByDocumentId } from '@/services/figure/FigureService'
import {
  listEquationsByDocumentId,
  validateLatex,
} from '@/services/equation/EquationService'

// ============ Service 方法 ============

/// 获取文档论文元数据(统计 + 完整性问题)
export async function getDocumentPaperMeta(
  documentId: EntityId,
): Promise<ServiceResult<DocumentPaperMeta>> {
  try {
    const document = await findDocumentById(documentId)
    if (!document) {
      return err({ code: NOT_FOUND, message: '文档不存在', retryable: false })
    }

    // 并行收集统计
    const [citationsResult, figuresResult, equationsResult, issuesResult] = await Promise.all([
      listDocumentCitations(documentId),
      listFiguresByDocumentId(documentId),
      listEquationsByDocumentId(documentId),
      checkIntegrity(documentId),
    ])

    if (!citationsResult.ok) return citationsResult
    if (!figuresResult.ok) return figuresResult
    if (!equationsResult.ok) return equationsResult
    if (!issuesResult.ok) return issuesResult

    const figures = figuresResult.data
    const figureCount = figures.filter((f) => f.kind === 'figure').length
    const tableCount = figures.filter((f) => f.kind === 'table').length

    return ok({
      documentId,
      citationCount: citationsResult.data.length,
      figureCount,
      tableCount,
      equationCount: equationsResult.data.length,
      wordCount: document.wordCount,
      issues: issuesResult.data,
    })
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 完整性检查(聚合各子 Service 的检测)
export async function checkIntegrity(
  documentId: EntityId,
): Promise<ServiceResult<IntegrityIssue[]>> {
  try {
    const issues: IntegrityIssue[] = []

    // 并行收集数据
    const [orphanResult, figuresResult, equationsResult] = await Promise.all([
      checkOrphanCitations(documentId),
      listFiguresByDocumentId(documentId),
      listEquationsByDocumentId(documentId),
    ])

    // 1. 悬空引文
    if (orphanResult.ok) {
      for (const citation of orphanResult.data) {
        issues.push({
          type: 'orphan_citation',
          objectId: citation.id,
          description: `引文 ${citation.inlineText} 关联的参考文献已删除`,
          suggestedAction: '请删除该引文或重新关联参考文献',
        })
      }
    }

    // 2. 图表完整性(兜底校验,理论上 createFigure 已校验 caption)
    if (figuresResult.ok) {
      const labelSeen = new Map<string, EntityId>()
      for (const figure of figuresResult.data) {
        // 缺 caption(兜底)
        if (!figure.caption.trim()) {
          issues.push({
            type: 'missing_caption',
            objectId: figure.id,
            description: `${figure.kind === 'figure' ? '图' : '表'} ${figure.number} 缺少题注`,
            suggestedAction: '请补充图表题注',
          })
        }
        // 缺 sourceId(警告级,材料真实性)
        if (!figure.sourceId) {
          issues.push({
            type: 'missing_source',
            objectId: figure.id,
            description: `${figure.kind === 'figure' ? '图' : '表'} ${figure.number} 未关联来源资料`,
            suggestedAction: '建议关联来源资料以保障材料真实性',
          })
        }
        // label 重复
        if (figure.label) {
          if (labelSeen.has(figure.label)) {
            issues.push({
              type: 'label_duplicate',
              objectId: figure.id,
              description: `图表标签 ${figure.label} 重复`,
              suggestedAction: '请更换图表标签',
            })
          } else {
            labelSeen.set(figure.label, figure.id)
          }
        }
      }
    }

    // 3. 公式完整性
    if (equationsResult.ok) {
      const labelSeen = new Map<string, EntityId>()
      for (const equation of equationsResult.data) {
        // label 重复
        if (equation.label) {
          if (labelSeen.has(equation.label)) {
            issues.push({
              type: 'label_duplicate',
              objectId: equation.id,
              description: `公式标签 ${equation.label} 重复`,
              suggestedAction: '请更换公式标签',
            })
          } else {
            labelSeen.set(equation.label, equation.id)
          }
        }
        // LaTeX 语法校验
        const latexCheck = await validateLatex(equation.latex)
        if (!latexCheck.ok) {
          issues.push({
            type: 'invalid_latex',
            objectId: equation.id,
            description: `公式 ${equation.number} 的 LaTeX 语法错误`,
            suggestedAction: '请修正 LaTeX 语法',
          })
        }
      }
    }

    return ok(issues)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

// ============ 导出元数据收集 ============

/// 获取参考文献表(供导出层使用)
export async function getBibliographyForExport(
  documentId: EntityId,
  style: CitationStyle,
): Promise<ServiceResult<string[]>> {
  return generateBibliography(documentId, style)
}

/// 获取文档关联的参考文献列表(供导出层使用)
export async function getReferencesForExport(
  documentId: EntityId,
): Promise<ServiceResult<Reference[]>> {
  return listDocumentReferences(documentId)
}

/// 获取文档内的图表列表(供导出层嵌入图片/表格)
export async function getFiguresForExport(
  documentId: EntityId,
): Promise<ServiceResult<Figure[]>> {
  return listFiguresByDocumentId(documentId)
}

/// 获取文档内的公式列表(供导出层生成 LaTeX 公式)
export async function getEquationsForExport(
  documentId: EntityId,
): Promise<ServiceResult<Equation[]>> {
  return listEquationsByDocumentId(documentId)
}

// ============ 内部工具 ============

/// 查询文档引文列表(内部使用,透传 CitationService)
async function listDocumentCitations(
  documentId: EntityId,
): Promise<ServiceResult<{ id: EntityId; inlineText: string }[]>> {
  // 复用 CitationService 的 listCitationsByDocumentId
  const { listCitationsByDocumentId } = await import('@/services/citation/CitationService')
  const result = await listCitationsByDocumentId(documentId)
  if (!result.ok) return result
  return ok(result.data.map((c) => ({ id: c.id, inlineText: c.inlineText })))
}
