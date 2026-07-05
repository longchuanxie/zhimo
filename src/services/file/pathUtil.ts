// 路径工具
// 封装 Tauri 路径 API，提供跨平台路径操作
// 对应文档：06_工程实施补齐/01_客户端技术架构详细设计_v1.0.md
//
// 本地数据目录结构：
// AppData/ai-writing-client/
//   config/           应用配置
//   database/         SQLite 数据库
//   projects/         项目文件
//     {project_id}/
//       sources/      资料文件
//       exports/      导出文件
//       cache/        缓存
//       attachments/  附件
//   logs/             日志

import {
  appDataDir,
  appConfigDir,
  join,
  sep,
} from '@tauri-apps/api/path'
import { platform } from '@tauri-apps/plugin-os'

/// 获取应用数据目录根路径
export async function getAppDataDir(): Promise<string> {
  return appDataDir()
}

/// 获取应用配置目录
export async function getAppConfigDir(): Promise<string> {
  return appConfigDir()
}

/// 获取数据库文件路径
export async function getDatabasePath(): Promise<string> {
  return join(await getAppDataDir(), 'main.sqlite')
}

/// 获取项目根目录
export async function getProjectsDir(): Promise<string> {
  return join(await getAppDataDir(), 'projects')
}

/// 获取指定项目的目录路径
export async function getProjectDir(projectId: string): Promise<string> {
  return join(await getProjectsDir(), projectId)
}

/// 获取项目资料目录
export async function getProjectSourcesDir(projectId: string): Promise<string> {
  return join(await getProjectDir(projectId), 'sources')
}

/// 获取项目导出目录
export async function getProjectExportsDir(projectId: string): Promise<string> {
  return join(await getProjectDir(projectId), 'exports')
}

/// 获取项目缓存目录
export async function getProjectCacheDir(projectId: string): Promise<string> {
  return join(await getProjectDir(projectId), 'cache')
}

/// 获取项目附件目录
export async function getProjectAttachmentsDir(
  projectId: string,
): Promise<string> {
  return join(await getProjectDir(projectId), 'attachments')
}

/// 获取日志目录
export async function getLogsDir(): Promise<string> {
  return join(await getAppDataDir(), 'logs')
}

/// 获取配置目录
export async function getConfigDir(): Promise<string> {
  return join(await getAppDataDir(), 'config')
}

/// 获取备份目录
export async function getBackupsDir(): Promise<string> {
  return join(await getAppDataDir(), 'database', 'backups')
}

/// 路径分隔符
export function getSep(): string {
  return sep()
}

/// 获取当前平台
export function getPlatform(): 'windows' | 'macos' | 'linux' | 'unknown' {
  const p = platform()
  if (p === 'windows') return 'windows'
  if (p === 'macos') return 'macos'
  if (p === 'linux') return 'linux'
  return 'unknown'
}
