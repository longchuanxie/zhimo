// 错误码与中文提示映射表
// 集中维护所有错误码、中文提示、可重试性
// 对应文档：06_工程实施补齐/12_错误码与中文提示表_v1.0.md

export interface ErrorEntry {
  /// 中文提示
  message: string
  /// 是否可重试
  retryable: boolean
  /// 建议动作（可选）
  suggestedAction?: string
}

export const ERROR_MAP = {
  // 通用错误
  UNKNOWN_ERROR: {
    message: '出现未知错误',
    retryable: true,
  },
  VALIDATION_ERROR: {
    message: '输入内容不完整或格式不正确',
    retryable: false,
  },
  NOT_FOUND: {
    message: '没有找到对应内容',
    retryable: false,
  },
  PERMISSION_DENIED: {
    message: '当前操作不被允许',
    retryable: false,
  },
  OPERATION_CANCELLED: {
    message: '操作已取消',
    retryable: false,
  },

  // 文件错误
  FILE_NOT_FOUND: {
    message: '文件不存在，请重新选择',
    retryable: false,
  },
  FILE_READ_FAILED: {
    message: '文件读取失败',
    retryable: true,
  },
  FILE_WRITE_FAILED: {
    message: '文件写入失败',
    retryable: true,
  },
  FILE_TOO_LARGE: {
    message: '文件过大，请拆分后导入',
    retryable: false,
  },
  FILE_TYPE_UNSUPPORTED: {
    message: '暂不支持该文件格式',
    retryable: false,
  },

  // 资料解析错误
  SOURCE_PARSE_FAILED: {
    message: '资料解析失败',
    retryable: true,
  },
  SOURCE_EMPTY_TEXT: {
    message: '没有提取到可用文本',
    retryable: false,
  },
  SOURCE_OCR_REQUIRED: {
    message: '检测到扫描版 PDF,暂不支持 OCR 识别',
    retryable: false,
    suggestedAction: '可将 PDF 转为文本型,或使用外部 OCR 工具处理后重新导入',
  },
  // 以下错误码预留给 OCR 集成后续迭代(当前阶段不会触发)
  SOURCE_OCR_MODEL_DOWNLOAD_FAILED: {
    message: 'OCR 模型下载失败,请检查网络后重试',
    retryable: true,
    suggestedAction: '可将模型文件手动放置到 AppData/models/ocr/ 目录',
  },
  SOURCE_OCR_FAILED: {
    message: 'OCR 识别失败',
    retryable: true,
  },
  SOURCE_CHUNK_FAILED: {
    message: '资料切片失败',
    retryable: true,
  },

  // 模型错误
  MODEL_NOT_CONFIGURED: {
    message: '请先配置模型服务商',
    retryable: false,
    suggestedAction: '前往模型设置',
  },
  MODEL_AUTH_FAILED: {
    message: 'API 密钥无效',
    retryable: false,
  },
  MODEL_ENDPOINT_FAILED: {
    message: '模型服务地址不可用',
    retryable: true,
  },
  MODEL_NOT_FOUND: {
    message: '找不到指定模型',
    retryable: false,
  },
  MODEL_CONTEXT_TOO_LONG: {
    message: '本次参考内容过长',
    retryable: true,
    suggestedAction: '正在自动压缩上下文重试...',
  },
  MODEL_CONTEXT_COMPACT_FAILED: {
    message: '上下文过大，自动压缩后仍超限，请返回排除部分内容',
    retryable: false,
    suggestedAction: '返回上下文预览，排除部分可选内容',
  },
  MODEL_TIMEOUT: {
    message: '模型响应超时',
    retryable: true,
  },
  MODEL_RATE_LIMITED: {
    message: '请求过于频繁，请稍后重试',
    retryable: true,
  },

  // Agent 错误
  AGENT_THREAD_NOT_FOUND: {
    message: '没有找到助手对话',
    retryable: false,
  },
  CONTEXT_PACK_FAILED: {
    message: '本次参考内容生成失败',
    retryable: true,
  },
  CONTEXT_EMPTY: {
    message: '当前没有可用参考内容',
    retryable: false,
  },
  AGENT_RUN_FAILED: {
    message: '智能助手生成失败',
    retryable: true,
  },

  // 导出错误
  EXPORT_NO_DOCUMENT: {
    message: '还没有可导出的文档',
    retryable: false,
  },
  EXPORT_FORMAT_UNSUPPORTED: {
    message: '暂不支持该导出格式',
    retryable: false,
  },
  EXPORT_WRITE_FAILED: {
    message: '导出文件写入失败',
    retryable: true,
  },
  EXPORT_FAILED: {
    message: '导出失败',
    retryable: true,
  },
  EXPORT_LATEX_FAILED: {
    message: 'LaTeX 导出失败',
    retryable: true,
  },
  EXPORT_DOCX_FAILED: {
    message: 'Word 文档导出失败',
    retryable: true,
  },

  // 论文写作错误
  CITATION_KEY_DUPLICATE: {
    message: '引用标识重复,请更换',
    retryable: false,
    suggestedAction: '引用标识在项目内必须唯一,如 smith2020ai',
  },
  REFERENCE_NOT_FOUND: {
    message: '参考文献不存在',
    retryable: false,
  },
  CITATION_ORPHAN: {
    message: '存在悬空引文,引用的参考文献已删除',
    retryable: false,
    suggestedAction: '请删除或重新关联该引文',
  },
  FIGURE_NUMBER_CONFLICT: {
    message: '图表编号冲突',
    retryable: false,
  },
  EQUATION_LABEL_DUPLICATE: {
    message: '公式标签重复',
    retryable: false,
    suggestedAction: '公式标签在文档内必须唯一,如 eq:euler',
  },
  BIBLIOGRAPHIC_METADATA_INVALID: {
    message: '书目元数据不完整或格式不正确',
    retryable: false,
  },
  LATEX_SYNTAX_INVALID: {
    message: '公式 LaTeX 语法错误',
    retryable: false,
    suggestedAction: '请检查 LaTeX 语法,如 $E=mc^2$',
  },

  // 拼写检查错误
  SPELL_CHECK_PARSE_FAILED: {
    message: '校对结果解析失败',
    retryable: true,
  },

  // 项目从文档导入错误
  DOCUMENT_IMPORT_FAILED: {
    message: '从文档创建项目失败',
    retryable: true,
  },
  DOCUMENT_FORMAT_UNSUPPORTED: {
    message: '暂不支持该文档格式,仅支持 .md/.txt/.docx/.pdf',
    retryable: false,
  },
  DOCUMENT_EMPTY_CONTENT: {
    message: '文档内容为空,无法创建项目',
    retryable: false,
  },
  PROJECT_INFERENCE_FAILED: {
    message: 'AI 推断项目信息失败',
    retryable: true,
    suggestedAction: '可手动填写项目信息后继续',
  },
} as const satisfies Record<string, ErrorEntry>

export type ErrorCode = keyof typeof ERROR_MAP

// 常用错误码常量：避免在 Service 中使用魔法字符串
export const VALIDATION_ERROR = 'VALIDATION_ERROR' satisfies ErrorCode
export const NOT_FOUND = 'NOT_FOUND' satisfies ErrorCode
export const UNKNOWN_ERROR = 'UNKNOWN_ERROR' satisfies ErrorCode
export const FILE_TYPE_UNSUPPORTED = 'FILE_TYPE_UNSUPPORTED' satisfies ErrorCode
export const SOURCE_EMPTY_TEXT = 'SOURCE_EMPTY_TEXT' satisfies ErrorCode
export const SOURCE_PARSE_FAILED = 'SOURCE_PARSE_FAILED' satisfies ErrorCode
export const SOURCE_OCR_REQUIRED = 'SOURCE_OCR_REQUIRED' satisfies ErrorCode
export const SOURCE_OCR_MODEL_DOWNLOAD_FAILED = 'SOURCE_OCR_MODEL_DOWNLOAD_FAILED' satisfies ErrorCode
export const SOURCE_OCR_FAILED = 'SOURCE_OCR_FAILED' satisfies ErrorCode
export const OPERATION_CANCELLED = 'OPERATION_CANCELLED' satisfies ErrorCode

// 模型相关错误码
export const MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED' satisfies ErrorCode
export const MODEL_AUTH_FAILED = 'MODEL_AUTH_FAILED' satisfies ErrorCode
export const MODEL_ENDPOINT_FAILED = 'MODEL_ENDPOINT_FAILED' satisfies ErrorCode
export const MODEL_NOT_FOUND = 'MODEL_NOT_FOUND' satisfies ErrorCode
export const MODEL_CONTEXT_TOO_LONG = 'MODEL_CONTEXT_TOO_LONG' satisfies ErrorCode
export const MODEL_CONTEXT_COMPACT_FAILED = 'MODEL_CONTEXT_COMPACT_FAILED' satisfies ErrorCode
export const MODEL_TIMEOUT = 'MODEL_TIMEOUT' satisfies ErrorCode
export const MODEL_RATE_LIMITED = 'MODEL_RATE_LIMITED' satisfies ErrorCode

// Agent / 上下文相关错误码
export const AGENT_THREAD_NOT_FOUND = 'AGENT_THREAD_NOT_FOUND' satisfies ErrorCode
export const CONTEXT_PACK_FAILED = 'CONTEXT_PACK_FAILED' satisfies ErrorCode
export const CONTEXT_EMPTY = 'CONTEXT_EMPTY' satisfies ErrorCode
export const AGENT_RUN_FAILED = 'AGENT_RUN_FAILED' satisfies ErrorCode

// 导出相关错误码
export const EXPORT_NO_DOCUMENT = 'EXPORT_NO_DOCUMENT' satisfies ErrorCode
export const EXPORT_FORMAT_UNSUPPORTED = 'EXPORT_FORMAT_UNSUPPORTED' satisfies ErrorCode
export const EXPORT_WRITE_FAILED = 'EXPORT_WRITE_FAILED' satisfies ErrorCode
export const EXPORT_FAILED = 'EXPORT_FAILED' satisfies ErrorCode
export const EXPORT_LATEX_FAILED = 'EXPORT_LATEX_FAILED' satisfies ErrorCode
export const EXPORT_DOCX_FAILED = 'EXPORT_DOCX_FAILED' satisfies ErrorCode

// 论文写作相关错误码
export const CITATION_KEY_DUPLICATE = 'CITATION_KEY_DUPLICATE' satisfies ErrorCode
export const REFERENCE_NOT_FOUND = 'REFERENCE_NOT_FOUND' satisfies ErrorCode
export const CITATION_ORPHAN = 'CITATION_ORPHAN' satisfies ErrorCode
export const FIGURE_NUMBER_CONFLICT = 'FIGURE_NUMBER_CONFLICT' satisfies ErrorCode
export const EQUATION_LABEL_DUPLICATE = 'EQUATION_LABEL_DUPLICATE' satisfies ErrorCode
export const BIBLIOGRAPHIC_METADATA_INVALID = 'BIBLIOGRAPHIC_METADATA_INVALID' satisfies ErrorCode
export const LATEX_SYNTAX_INVALID = 'LATEX_SYNTAX_INVALID' satisfies ErrorCode

// 拼写检查相关错误码
export const SPELL_CHECK_PARSE_FAILED = 'SPELL_CHECK_PARSE_FAILED' satisfies ErrorCode

// 项目从文档导入相关错误码
export const DOCUMENT_IMPORT_FAILED = 'DOCUMENT_IMPORT_FAILED' satisfies ErrorCode
export const DOCUMENT_FORMAT_UNSUPPORTED = 'DOCUMENT_FORMAT_UNSUPPORTED' satisfies ErrorCode
export const DOCUMENT_EMPTY_CONTENT = 'DOCUMENT_EMPTY_CONTENT' satisfies ErrorCode
export const PROJECT_INFERENCE_FAILED = 'PROJECT_INFERENCE_FAILED' satisfies ErrorCode

/// 根据错误码获取中文提示
export function getErrorMessage(code: string): string {
  return (ERROR_MAP as Record<string, ErrorEntry>)[code]?.message ?? '出现未知错误'
}

/// 根据错误码判断是否可重试
export function isRetryable(code: string): boolean {
  return (ERROR_MAP as Record<string, ErrorEntry>)[code]?.retryable ?? true
}

/// 根据错误码获取建议动作
export function getSuggestedAction(code: string): string | undefined {
  return (ERROR_MAP as Record<string, ErrorEntry>)[code]?.suggestedAction
}
