// 测试全局 setup
// 1. 引入 jest-dom 断言扩展
// 2. mock Tauri 插件，使 Service 层测试无需真实 Tauri runtime

import '@testing-library/jest-dom/vitest'
import { vi, beforeEach } from 'vitest'
import {
  resetMockDatabase,
  mockSelect,
  mockExecute,
} from './fixtures/sqlMock'

// ============ mock @tauri-apps/plugin-sql ============
// db.ts 通过 `import Database from '@tauri-apps/plugin-sql'` 获取默认导出，
// 再调用 Database.load(...).select / execute
// 事务通过 BEGIN/COMMIT/ROLLBACK 语句走 mockExecute，由 sqlMock 维护事务快照
vi.mock('@tauri-apps/plugin-sql', () => {
  const mockDb = {
    select: (sql: string, bindValues?: unknown[]) => mockSelect(sql, bindValues),
    execute: (sql: string, bindValues?: unknown[]) => mockExecute(sql, bindValues),
    close: () => Promise.resolve(),
  }
  return {
    default: {
      load: () => Promise.resolve(mockDb),
      isUrl: (s: string) => typeof s === 'string' && s.startsWith('sqlite:'),
    },
  }
})

// ============ mock @tauri-apps/plugin-fs ============
// 文件操作 mock：返回内存数据，避免真实文件 IO
// 使用 vi.hoisted 保证 mock 工厂可访问内存文件系统
const { memoryFiles } = vi.hoisted(() => ({
  memoryFiles: new Map<string, string | Uint8Array>(),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (path: string) => {
    const content = memoryFiles.get(path)
    if (content == null) throw new Error(`文件不存在: ${path}`)
    return typeof content === 'string' ? content : new TextDecoder().decode(content)
  }),
  writeTextFile: vi.fn(async (path: string, data: string) => {
    memoryFiles.set(path, data)
  }),
  readFile: vi.fn(async (path: string) => {
    const content = memoryFiles.get(path)
    if (content == null) throw new Error(`文件不存在: ${path}`)
    return typeof content === 'string' ? new TextEncoder().encode(content) : content
  }),
  writeFile: vi.fn(async (path: string, data: Uint8Array) => {
    memoryFiles.set(path, data)
  }),
  exists: vi.fn(async (path: string) => memoryFiles.has(path)),
  remove: vi.fn(async (path: string) => {
    memoryFiles.delete(path)
  }),
  mkdir: vi.fn(async () => undefined),
  removeDir: vi.fn(async () => undefined),
  copyFile: vi.fn(async (from: string, to: string) => {
    const content = memoryFiles.get(from)
    if (content != null) memoryFiles.set(to, content)
  }),
  renameFile: vi.fn(async (from: string, to: string) => {
    const content = memoryFiles.get(from)
    if (content != null) {
      memoryFiles.set(to, content)
      memoryFiles.delete(from)
    }
  }),
  readDir: vi.fn(async () => []),
  BaseDirectory: { AppData: 'AppData', App: 'App', Desktop: 'Desktop' },
}))

// ============ mock @tauri-apps/plugin-dialog ============
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
  confirm: vi.fn(async () => false),
  message: vi.fn(async () => undefined),
  ask: vi.fn(async () => false),
}))

// ============ mock @tauri-apps/plugin-os ============
vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => 'windows',
  version: () => '10',
  hostname: () => 'localhost',
  locale: () => 'zh-CN',
}))

// ============ mock @tauri-apps/api/core invoke ============
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {
    throw new Error('invoke 未在测试中配置')
  }),
  convertFileSrc: (path: string) => `asset://${path}`,
}))

// ============ 全局工具 ============
/// 每个测试前重置内存数据库与文件系统
beforeEach(() => {
  resetMockDatabase()
  memoryFiles.clear()
})
