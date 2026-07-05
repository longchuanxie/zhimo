// 文件系统网关
// 封装 Tauri 文件系统 API，提供统一的文件操作接口
// 对应文档：06_工程实施补齐/01_客户端技术架构详细设计_v1.0.md
//
// 架构约束：
// - 只有 Service 层可以使用此模块
// - UI 层禁止直接使用

import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  readFile,
  writeFile,
  remove,
  rename as fsRename,
  copyFile,
} from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

/// 确保目录存在，递归创建
export async function ensureDir(dirPath: string): Promise<void> {
  if (!(await exists(dirPath))) {
    await mkdir(dirPath, { recursive: true })
  }
}

/// 读取文本文件
export async function readText(filePath: string): Promise<string> {
  return readTextFile(filePath)
}

/// 写入文本文件
export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(await parentDir(filePath))
  await writeTextFile(filePath, content)
}

/// 读取二进制文件
export async function readBinary(filePath: string): Promise<Uint8Array> {
  return readFile(filePath)
}

/// 写入二进制文件
export async function writeBinary(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  await ensureDir(await parentDir(filePath))
  await writeFile(filePath, data)
}

/// 复制文件
export async function copyFileTo(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await ensureDir(await parentDir(targetPath))
  await copyFile(sourcePath, targetPath)
}

/// 删除文件
export async function removeFile(filePath: string): Promise<void> {
  if (await exists(filePath)) {
    await remove(filePath)
  }
}

/// 重命名/移动文件
export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await fsRename(oldPath, newPath)
}

/// 检查文件是否存在
export async function fileExists(filePath: string): Promise<boolean> {
  return exists(filePath)
}

/// 拼接路径
export async function joinPath(...segments: string[]): Promise<string> {
  return join(...segments)
}

/// 获取父目录路径
async function parentDir(filePath: string): Promise<string> {
  // 简单实现：取最后一个分隔符之前的部分
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx > 0 ? filePath.substring(0, idx) : '.'
}
