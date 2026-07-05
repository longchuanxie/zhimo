// 资料解析 Tauri command 封装
// 对应任务:#2 PDF/Word 解析
//
// 架构约束:
// - 仅 Service 层(SourceService)可调用此模块
// - UI 层禁止直接调用
// - 封装 Rust 端 parse_source_file 命令,提供类型安全接口

import { invoke } from '@tauri-apps/api/core'
import type { ParsedSource } from '@/types'

/// 调用 Rust 端解析 PDF / Word 文件
///
/// @param filePath 文件绝对路径(已复制到项目资料目录)
/// @param enableOcr 是否启用 OCR(扫描版 PDF 自动回退)
/// @returns ParsedSource 解析结果(含全文、分片、页数、OCR 标记)
///
/// 错误处理:
/// - Rust 端返回 Err(String) 时,invoke 会抛出异常
/// - 异常消息为错误码字符串(如 "SOURCE_OCR_REQUIRED")或具体错误描述
/// - 调用方(SourceService.importFile)负责将异常转换为 ServiceResult.err
export async function parseSourceFile(
  filePath: string,
  enableOcr: boolean,
): Promise<ParsedSource> {
  return invoke<ParsedSource>('parse_source_file', {
    filePath,
    enableOcr,
  })
}
