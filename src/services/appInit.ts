// 应用初始化服务
// 负责应用启动时的初始化流程
// 对应文档：06_工程实施补齐/01_客户端技术架构详细设计_v1.0.md §10.1
//
// 启动流程：
// 1. 初始化 SQLite（由 tauri-plugin-sql 自动完成迁移）
// 2. 确保本地数据目录结构存在
// 3. 验证默认用户/工作空间存在

import { ensureDir } from '@/services/file/fileGateway'
import {
  getAppDataDir,
  getProjectsDir,
  getLogsDir,
  getConfigDir,
  getBackupsDir,
} from '@/services/file/pathUtil'
import { findDefaultUser, findDefaultWorkspace } from '@/services/database/userWorkspaceRepository'
import type { ServiceResult } from '@/types/service'
import { ok, err, fromUnknown } from '@/types/service'

/// 应用初始化状态
export type InitState =
  | { status: 'idle' }
  | { status: 'initializing' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

/// 初始化本地数据目录结构
async function initLocalDirectories(): Promise<void> {
  const dirs = [
    await getAppDataDir(),
    await getProjectsDir(),
    await getLogsDir(),
    await getConfigDir(),
    await getBackupsDir(),
  ]

  for (const dir of dirs) {
    await ensureDir(dir)
  }
}

/// 验证默认数据
async function verifyDefaultData(): Promise<void> {
  const user = await findDefaultUser()
  if (!user) {
    throw new Error('默认用户不存在，数据库迁移可能失败')
  }

  const workspace = await findDefaultWorkspace()
  if (!workspace) {
    throw new Error('默认工作空间不存在，数据库迁移可能失败')
  }
}

/// 执行应用初始化
export async function initializeApp(): Promise<ServiceResult<void>> {
  try {
    // 1. 初始化本地目录
    try {
      await initLocalDirectories()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`本地数据目录初始化失败: ${message}`)
    }

    // 2. 验证默认数据（数据库迁移由 tauri-plugin-sql 自动执行）
    try {
      await verifyDefaultData()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`数据库验证失败: ${message}`)
    }

    return ok(undefined)
  } catch (error) {
    return err(fromUnknown(error))
  }
}
