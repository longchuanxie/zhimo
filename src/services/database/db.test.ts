// 数据库访问层测试：验证 select/execute/batchExecute 在 mock 环境下的行为
// 这是测试基础设施的冒烟测试，确保后续 Service 测试可信赖

import { describe, it, expect, beforeEach } from 'vitest'
import { select, execute, batchExecute } from './db'
import { resetMockDatabase, seedTable } from '@/test/fixtures/sqlMock'

beforeEach(() => {
  resetMockDatabase()
})

describe('db mock 基础设施', () => {
  it('execute INSERT 后 select 能查到数据', async () => {
    await execute(
      'CREATE TABLE IF NOT EXISTS items (id TEXT, name TEXT, status TEXT)',
    )
    await execute(
      'INSERT INTO items (id, name, status) VALUES (?, ?, ?)',
      ['i1', '测试项', 'pending'],
    )

    const rows = await select<{ id: string; name: string; status: string }>(
      'SELECT * FROM items WHERE status = ?',
      ['pending'],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('i1')
    expect(rows[0].name).toBe('测试项')
  })

  it('execute UPDATE 返回受影响行数', async () => {
    await execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT, done INTEGER)')
    await execute('INSERT INTO tasks (id, done) VALUES (?, ?)', ['t1', 0])
    await execute('INSERT INTO tasks (id, done) VALUES (?, ?)', ['t2', 0])

    const affected = await execute(
      'UPDATE tasks SET done = ? WHERE done = ?',
      [1, 0],
    )

    expect(affected).toBe(2)
  })

  it('execute DELETE 移除匹配行', async () => {
    await execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT, done INTEGER)')
    await execute('INSERT INTO tasks (id, done) VALUES (?, ?)', ['t1', 1])
    await execute('INSERT INTO tasks (id, done) VALUES (?, ?)', ['t2', 0])

    const affected = await execute('DELETE FROM tasks WHERE done = ?', [1])

    expect(affected).toBe(1)
    const remaining = await select<{ id: string; done: number }>('SELECT * FROM tasks')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('t2')
  })

  it('batchExecute 事务性执行多条语句（全部成功）', async () => {
    await execute('CREATE TABLE IF NOT EXISTS logs (id TEXT, msg TEXT)')
    await batchExecute([
      { sql: 'INSERT INTO logs (id, msg) VALUES (?, ?)', bindValues: ['l1', '第一条'] },
      { sql: 'INSERT INTO logs (id, msg) VALUES (?, ?)', bindValues: ['l2', '第二条'] },
      { sql: 'INSERT INTO logs (id, msg) VALUES (?, ?)', bindValues: ['l3', '第三条'] },
    ])

    const rows = await select<{ id: string; msg: string }>('SELECT * FROM logs ORDER BY id ASC')
    expect(rows).toHaveLength(3)
    expect(rows[0].msg).toBe('第一条')
    expect(rows[2].msg).toBe('第三条')
  })

  it('batchExecute 事务失败时回滚（部分语句失败不影响已提交数据）', async () => {
    // 1. 准备初始数据
    await execute('CREATE TABLE IF NOT EXISTS accounts (id TEXT, balance INTEGER)')
    await execute('INSERT INTO accounts (id, balance) VALUES (?, ?)', ['a1', 100])
    await execute('INSERT INTO accounts (id, balance) VALUES (?, ?)', ['a2', 50])

    // 2. batchExecute 中第二条 SQL 无效，应抛错并触发 ROLLBACK
    //    事务内的第一条 UPDATE 也应被回滚（数据保持初始状态）
    await expect(
      batchExecute([
        { sql: 'UPDATE accounts SET balance = ? WHERE id = ?', bindValues: [80, 'a1'] },
        { sql: 'THIS IS INVALID SQL', bindValues: [] },
        { sql: 'UPDATE accounts SET balance = ? WHERE id = ?', bindValues: [70, 'a2'] },
      ]),
    ).rejects.toThrow()

    // 3. 验证：事务回滚后，所有数据保持初始状态（第一条 UPDATE 也被回滚）
    const rows = await select<{ id: string; balance: number }>('SELECT * FROM accounts ORDER BY id ASC')
    expect(rows).toHaveLength(2)
    expect(rows[0].balance).toBe(100)
    expect(rows[1].balance).toBe(50)
  })

  it('batchExecute 事务中 ROLLBACK 后可继续正常 execute（事务状态已清理）', async () => {
    await execute('CREATE TABLE IF NOT EXISTS logs (id TEXT, msg TEXT)')

    // 触发一次回滚
    await expect(
      batchExecute([
        { sql: 'INSERT INTO logs (id, msg) VALUES (?, ?)', bindValues: ['l1', '第一条'] },
        { sql: 'INVALID SQL', bindValues: [] },
      ]),
    ).rejects.toThrow()

    // 回滚后再次 execute 应正常工作（事务快照已清除，不残留嵌套状态）
    await execute('INSERT INTO logs (id, msg) VALUES (?, ?)', ['l2', '回滚后的写入'])
    const rows = await select<{ id: string; msg: string }>('SELECT * FROM logs ORDER BY id ASC')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('l2')
  })

  it('select LIKE 模糊查询', async () => {
    seedTable('projects', [
      { id: 'p1', name: '科幻小说集', is_deleted: 0 },
      { id: 'p2', name: '散文合集', is_deleted: 0 },
      { id: 'p3', name: '技术文档', is_deleted: 0 },
    ])

    const rows = await select<{ id: string; name: string }>(
      'SELECT * FROM projects WHERE name LIKE ?',
      ['%集%'],
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.name)).toContain('科幻小说集')
  })

  it('select ORDER BY DESC 排序', async () => {
    seedTable('projects', [
      { id: 'p1', name: 'b', updated_at: '2026-01-01' },
      { id: 'p2', name: 'a', updated_at: '2026-02-01' },
      { id: 'p3', name: 'c', updated_at: '2026-03-01' },
    ])

    const rows = await select<{ id: string; name: string; updated_at: string }>(
      'SELECT * FROM projects ORDER BY updated_at DESC',
    )

    expect(rows[0].name).toBe('c')
    expect(rows[2].name).toBe('b')
  })
})

