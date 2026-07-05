// 数据库连接管理
// 封装 tauri-plugin-sql，提供统一的 SQL 执行接口
// 对应文档：06_工程实施补齐/02_SQLite数据库DDL与迁移设计_v1.0.md
//
// 架构约束：
// - SQL 执行 API（select/execute/batchExecute）仅 Repository 层可用
// - 事务协调 API（runInTransaction）允许 Service 层调用，用于跨 Repository 多步写入的原子性
// - UI 层禁止直接使用此模块
//
// 并发策略：
// - 不做应用层锁控制，允许同时操作多章节编写等并发场景
// - SQLite WAL 模式下支持并发读 + 单写，写冲突由 SQLite 自身 busy_timeout 处理
// - runInTransaction 仅包裹跨 Repository 的多步写入（如创建文档 + 关联节点），保证原子性

import Database from '@tauri-apps/plugin-sql'

/// 数据库连接单例
let dbInstance: Database | null = null

/// 数据库连接初始化标志
let initPromise: Promise<Database> | null = null

/// 获取数据库连接（单例）
/// 迁移由 tauri-plugin-sql 在 Rust 端自动执行
/// 初始化时配置 WAL 模式与 busy_timeout，确保并发读写不互斥
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance
  }

  if (!initPromise) {
    initPromise = Database.load('sqlite:main.sqlite').then(async (db) => {
      // WAL 模式：允许并发读 + 单写，读写不互斥
      // 注意：PRAGMA journal_mode 不能在事务内执行，Database.load 后处于 autocommit 状态
      await db.execute('PRAGMA journal_mode = WAL')
      // busy_timeout：写锁被占时等待最多 5 秒，而非立即报 SQLITE_BUSY
      await db.execute('PRAGMA busy_timeout = 5000')
      return db
    })
  }

  dbInstance = await initPromise
  return dbInstance
}

/// 执行 SELECT 查询，返回类型化结果
export async function select<T>(
  sql: string,
  bindValues?: unknown[],
): Promise<T[]> {
  const db = await getDatabase()
  const result = await db.select(sql, bindValues)
  return result as T[]
}

/// 执行 INSERT/UPDATE/DELETE，返回受影响行数
export async function execute(
  sql: string,
  bindValues?: unknown[],
): Promise<number> {
  const db = await getDatabase()
  const result = await db.execute(sql, bindValues)
  return result.rowsAffected
}

/// 批量执行 SQL（事务）
/// 通过 BEGIN/COMMIT/ROLLBACK 语句管理事务，任一条失败则全部回滚
export async function batchExecute(
  statements: Array<{ sql: string; bindValues?: unknown[] }>,
): Promise<void> {
  const db = await getDatabase()
  await db.execute('BEGIN')
  try {
    for (const { sql, bindValues } of statements) {
      await db.execute(sql, bindValues)
    }
    await db.execute('COMMIT')
  } catch (error) {
    // 回滚失败不掩盖原始错误
    try {
      await db.execute('ROLLBACK')
    } catch {
      // 忽略 ROLLBACK 失败
    }
    throw error
  }
}

/// 在事务中执行多步操作（推荐 Service 层使用）
/// 通过回调函数组合任意 Repository 调用，保持 Repository 的 typed API 封装
/// 任一步抛错则整个事务回滚，避免半成品数据
///
/// @example
/// ```ts
/// const result = await runInTransaction(async () => {
///   const doc = await createDocument({ ... })
///   await updateOutlineNode(nodeId, { linkedDocumentId: doc.id })
///   return doc
/// })
/// ```
export async function runInTransaction<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const db = await getDatabase()
  await db.execute('BEGIN')
  try {
    const result = await fn()
    await db.execute('COMMIT')
    return result
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // 忽略 ROLLBACK 失败，不掩盖原始错误
    }
    throw error
  }
}
