// 公式 Service
// 负责块级公式的业务逻辑:CRUD + 自动编号 + label 唯一性 + LaTeX 语法校验
//
// 架构约束:
// - 通过 equationRepository 访问 DB
// - 动态 import katex 进行语法校验(避免未安装时崩溃)
// - 返回 ServiceResult<T>
// - label 文档内唯一(论文公式规范)

import type { Equation, EntityId } from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'
import {
  VALIDATION_ERROR,
  NOT_FOUND,
  EQUATION_LABEL_DUPLICATE,
  LATEX_SYNTAX_INVALID,
} from '@/constants/errors'
import {
  listEquationsByDocument,
  findEquationById,
  getMaxEquationNumber,
  findEquationByLabel,
  insertEquation,
  updateEquation as repoUpdateEquation,
  softDeleteEquation,
} from '@/services/database/equationRepository'

// ============ 类型定义 ============

export type CreateEquationInput = {
  projectId: EntityId
  documentId: EntityId
  latex: string
  label?: string | null
  prosemirrorPos?: number | null
}

export type UpdateEquationInput = {
  equationId: EntityId
  patch: Partial<{
    latex: string
    label: string | null
    prosemirrorPos: number | null
  }>
}

// ============ LaTeX 语法校验 ============

/**
 * 校验 LaTeX 语法
 * 动态 import katex,未安装时返回 ok(降级,不阻塞业务)
 */
export async function validateLatex(latex: string): Promise<ServiceResult<void>> {
  if (!latex.trim()) {
    return err({
      code: VALIDATION_ERROR,
      message: '公式 LaTeX 源码不能为空',
      retryable: false,
    })
  }
  try {
    const katex = (await import('katex')).default
    katex.renderToString(latex, { throwOnError: true, displayMode: true })
    return ok(undefined)
  } catch (e) {
    return err({
      code: LATEX_SYNTAX_INVALID,
      message: '公式 LaTeX 语法错误',
      retryable: false,
      suggestedAction: '请检查 LaTeX 语法,如 $E=mc^2$',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

// ============ Service 方法 ============

/// 查询文档内的公式列表(按编号升序)
export async function listEquationsByDocumentId(
  documentId: EntityId,
): Promise<ServiceResult<Equation[]>> {
  try {
    const equations = await listEquationsByDocument(documentId)
    return ok(equations)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 查询公式详情
export async function getEquation(
  equationId: EntityId,
): Promise<ServiceResult<Equation>> {
  try {
    const equation = await findEquationById(equationId)
    if (!equation) {
      return err({ code: NOT_FOUND, message: '公式不存在', retryable: false })
    }
    return ok(equation)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 新建公式(自动编号 + label 唯一性 + LaTeX 校验)
export async function createEquation(
  input: CreateEquationInput,
): Promise<ServiceResult<Equation>> {
  try {
    // 1. 校验 LaTeX 非空
    if (!input.latex.trim()) {
      return err({
        code: VALIDATION_ERROR,
        message: '公式 LaTeX 源码不能为空',
        retryable: false,
      })
    }

    // 2. 校验 LaTeX 语法
    const latexCheck = await validateLatex(input.latex)
    if (!latexCheck.ok) {
      return latexCheck
    }

    // 3. 校验 label 文档内唯一(若提供)
    if (input.label) {
      const existing = await findEquationByLabel(input.documentId, input.label)
      if (existing) {
        return err({
          code: EQUATION_LABEL_DUPLICATE,
          message: '公式标签在文档内已存在',
          retryable: false,
          suggestedAction: '请更换公式标签,如 eq:euler',
        })
      }
    }

    // 4. 自动分配编号
    const maxNumber = await getMaxEquationNumber(input.documentId)
    const number = maxNumber + 1

    // 5. 写入
    const created = await insertEquation({
      projectId: input.projectId,
      documentId: input.documentId,
      number,
      label: input.label ?? null,
      latex: input.latex,
      prosemirrorPos: input.prosemirrorPos ?? null,
    })

    return ok(created)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 更新公式(修改 label 重新校验唯一性,修改 latex 重新校验语法)
export async function updateEquation(
  input: UpdateEquationInput,
): Promise<ServiceResult<Equation>> {
  try {
    const equation = await findEquationById(input.equationId)
    if (!equation) {
      return err({ code: NOT_FOUND, message: '公式不存在', retryable: false })
    }

    // 校验 LaTeX 语法(若修改)
    if (input.patch.latex !== undefined) {
      if (!input.patch.latex.trim()) {
        return err({
          code: VALIDATION_ERROR,
          message: '公式 LaTeX 源码不能为空',
          retryable: false,
        })
      }
      const latexCheck = await validateLatex(input.patch.latex)
      if (!latexCheck.ok) {
        return latexCheck
      }
    }

    // 校验 label 唯一性(若修改且与当前不同)
    if (input.patch.label !== undefined && input.patch.label && input.patch.label !== equation.label) {
      const existing = await findEquationByLabel(equation.documentId, input.patch.label)
      if (existing && existing.id !== equation.id) {
        return err({
          code: EQUATION_LABEL_DUPLICATE,
          message: '公式标签在文档内已存在',
          retryable: false,
          suggestedAction: '请更换公式标签,如 eq:euler',
        })
      }
    }

    await repoUpdateEquation(input.equationId, input.patch)

    const updated = await findEquationById(input.equationId)
    if (!updated) {
      return err({ code: NOT_FOUND, message: '公式不存在', retryable: false })
    }
    return ok(updated)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 删除公式(软删除)
export async function deleteEquation(
  equationId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    const equation = await findEquationById(equationId)
    if (!equation) {
      return err({ code: NOT_FOUND, message: '公式不存在', retryable: false })
    }
    await softDeleteEquation(equationId)
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}

/// 重新编号(按 prosemirrorPos 升序)
export async function renumberEquations(
  documentId: EntityId,
): Promise<ServiceResult<void>> {
  try {
    const equations = await listEquationsByDocument(documentId)
    // 按 prosemirrorPos 升序(null 排末尾)
    const sorted = [...equations].sort((a, b) => {
      const pa = a.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      const pb = b.prosemirrorPos ?? Number.MAX_SAFE_INTEGER
      return pa - pb
    })
    for (let i = 0; i < sorted.length; i++) {
      const newNumber = i + 1
      if (sorted[i]!.number !== newNumber) {
        await repoUpdateEquation(sorted[i]!.id, { number: newNumber })
      }
    }
    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
