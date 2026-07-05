// 内存版 SQL 引擎，模拟 tauri-plugin-sql 的 select/execute 行为
// 供 Service 层单元测试使用，避免依赖真实 Tauri runtime 与 SQLite
//
// 支持的 SQL 子集（覆盖项目 Repository 实际使用模式）：
// - CREATE TABLE [IF NOT EXISTS] name (col defs)
// - INSERT INTO name (cols) VALUES (?, ?, ...)
// - SELECT cols FROM name [JOIN ...] WHERE ... [ORDER BY ...] [LIMIT ?]
// - UPDATE name SET col=?, ... WHERE ...
// - DELETE FROM name WHERE ...
// - BEGIN / COMMIT / ROLLBACK（事务控制，由 mockExecute 处理状态）
//
// 关键设计：WHERE 绑定值在编译时一次性消费，对所有行复用，避免重复 shift 导致语义错误
// 未知 SQL 抛错（避免静默吞掉 bug，例如事务回滚测试需要 INVALID SQL 真的失败）

type Row = Record<string, unknown>

interface TableSchema {
  columns: string[]
}

interface MockDatabase {
  tables: Map<string, TableSchema>
  rows: Map<string, Row[]>
}

const db: MockDatabase = {
  tables: new Map(),
  rows: new Map(),
}

/// 当前事务快照（BEGIN 时建立，COMMIT/ROLLBACK 时清除）
/// 仅在事务中时非 null
let transactionSnapshot: MockDatabase | null = null

/// 重置内存数据库（每个测试前调用）
export function resetMockDatabase(): void {
  db.tables.clear()
  db.rows.clear()
  transactionSnapshot = null
}

/// 直接向某表插入测试数据（绕过 SQL 解析，用于快速构造夹具）
export function seedTable(name: string, rows: Row[]): void {
  if (!db.rows.has(name)) {
    db.rows.set(name, [])
    db.tables.set(name, { columns: rows.length > 0 ? Object.keys(rows[0]) : [] })
  }
  db.rows.get(name)!.push(...rows)
}

/// 内存 SQL 执行入口
export async function mockSelect<T = Row>(sql: string, bindValues?: unknown[]): Promise<T[]> {
  const result = executeSql(sql, bindValues ?? [])
  return result.rows as T[]
}

export async function mockExecute(sql: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }> {
  const upper = sql.trim().toUpperCase()
  // PRAGMA 语句：静默接受，不执行（内存 mock 不需要 WAL/busy_timeout 等设置）
  if (upper.startsWith('PRAGMA')) {
    return { rowsAffected: 0 }
  }
  // 事务控制语句：在 mock 层处理状态，不下传给 executeSql
  if (upper === 'BEGIN' || upper === 'BEGIN TRANSACTION') {
    if (transactionSnapshot) {
      throw new Error('sqlMock: 已有事务正在进行，不支持嵌套事务')
    }
    transactionSnapshot = snapshotDb()
    return { rowsAffected: 0 }
  }
  if (upper === 'COMMIT' || upper === 'COMMIT TRANSACTION') {
    transactionSnapshot = null
    return { rowsAffected: 0 }
  }
  if (upper === 'ROLLBACK' || upper === 'ROLLBACK TRANSACTION') {
    if (transactionSnapshot) {
      restoreDb(transactionSnapshot)
      transactionSnapshot = null
    }
    return { rowsAffected: 0 }
  }
  const result = executeSql(sql, bindValues ?? [])
  return { rowsAffected: result.rowsAffected ?? 0 }
}

interface ExecResult {
  rows: Row[]
  rowsAffected?: number
}

// ============ SQL 解析与执行 ============

function executeSql(sql: string, bindValues: unknown[]): ExecResult {
  const trimmed = sql.trim().replace(/;$/, '').trim()
  const upper = trimmed.toUpperCase()

  if (upper.startsWith('CREATE TABLE')) return execCreateTable(trimmed)
  if (upper.startsWith('INSERT INTO')) return execInsert(trimmed, bindValues)
  if (upper.startsWith('SELECT')) return execSelect(trimmed, bindValues)
  if (upper.startsWith('UPDATE')) return execUpdate(trimmed, bindValues)
  if (upper.startsWith('DELETE FROM')) return execDelete(trimmed, bindValues)
  // 未知 SQL 抛错（事务控制语句已由 mockExecute 拦截，到这里说明是真正的语法错误）
  throw new Error(`sqlMock: 不支持的 SQL 语法: ${sql.slice(0, 80)}`)
}

function execCreateTable(sql: string): ExecResult {
  const match = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([^)]+)\)/i)
  if (!match) return { rows: [] }
  const [, name, colsDef] = match
  const columns = colsDef
    .split(',')
    .map((c) => c.trim().split(/\s+/)[0].replace(/["`]/g, ''))
    .filter((c) => c && !c.toUpperCase().startsWith('PRIMARY'))
  db.tables.set(name, { columns })
  if (!db.rows.has(name)) db.rows.set(name, [])
  return { rows: [] }
}

function execInsert(sql: string, bindValues: unknown[]): ExecResult {
  const match = sql.match(/INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
  if (!match) return { rows: [], rowsAffected: 0 }
  const [, name, colsStr, placeholdersStr] = match
  const cols = colsStr.split(',').map((c) => c.trim())
  const placeholders = placeholdersStr.split(',').map((p) => p.trim())

  const row: Row = {}
  cols.forEach((col, i) => {
    if (placeholders[i] === '?') {
      row[col] = bindValues.shift()
    } else {
      const lit = placeholders[i].replace(/^['"]|['"]$/g, '')
      row[col] = isNaN(Number(lit)) ? lit : Number(lit)
    }
  })

  if (!db.rows.has(name)) db.rows.set(name, [])
  db.rows.get(name)!.push(row)
  return { rows: [], rowsAffected: 1 }
}

function execSelect(sql: string, bindValues: unknown[]): ExecResult {
  const fromMatch = sql.match(/FROM\s+(\w+)/i)
  if (!fromMatch) return { rows: [] }
  const mainTable = fromMatch[1]
  let rows = [...(db.rows.get(mainTable) ?? [])]

  // JOIN（简化：INNER JOIN ... ON a.col = b.col）
  const joinMatches = [...sql.matchAll(/INNER JOIN\s+(\w+)\s+\w+\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/gi)]
  for (const jm of joinMatches) {
    const [, joinTable, t1, c1, t2, c2] = jm
    const aliasToTable = (alias: string) =>
      alias === mainTable || alias === mainTable.slice(0, 1) ? mainTable : joinTable
    const leftTable = aliasToTable(t1)
    const rightTable = aliasToTable(t2)
    const leftCol = t1 === leftTable ? c1 : c2
    const rightCol = t1 === leftTable ? c2 : c1
    const leftRows = db.rows.get(leftTable) ?? []
    const rightRows = db.rows.get(rightTable) ?? []
    rows = leftRows.flatMap((lr) =>
      rightRows
        .filter((rr) => lr[leftCol] === rr[rightCol])
        .map((rr) => ({ ...lr, ...rr })),
    )
  }

  // WHERE（编译一次，对所有行复用绑定值）
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER BY|LIMIT|$)/i)
  if (whereMatch) {
    const compiled = compileWhere(whereMatch[1].trim(), bindValues)
    rows = rows.filter((r) => matchRow(compiled, r))
  }

  // ORDER BY field [DESC|ASC]
  const orderMatch = sql.match(/ORDER BY\s+(\w+)\s*(DESC|ASC)?/i)
  if (orderMatch) {
    const [, field, dir] = orderMatch
    const desc = (dir ?? '').toUpperCase() === 'DESC'
    rows.sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (va == null) return desc ? 1 : -1
      if (vb == null) return desc ? -1 : 1
      const cmp = String(va).localeCompare(String(vb))
      return desc ? -cmp : cmp
    })
  }

  // LIMIT ?
  const limitMatch = sql.match(/LIMIT\s+\?/i)
  if (limitMatch) {
    const limit = bindValues.shift() as number
    rows = rows.slice(0, limit)
  }

  // SELECT COUNT(*) AS xxx / SELECT COUNT(*) 聚合
  const countMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+(?:AS\s+(\w+)\s+)?FROM/i)
  if (countMatch) {
    const alias = countMatch[1] ?? 'count'
    return { rows: [{ [alias]: rows.length }] }
  }

  // SELECT cols（* 或指定列）
  const colsMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i)
  if (colsMatch && colsMatch[1].trim() !== '*') {
    const cols = colsMatch[1].split(',').map((c) => c.trim())
    rows = rows.map((r) => {
      const proj: Row = {}
      cols.forEach((c) => {
        if (r[c] !== undefined) proj[c] = r[c]
      })
      return proj
    })
  }

  return { rows }
}

function execUpdate(sql: string, bindValues: unknown[]): ExecResult {
  // UPDATE name SET col=?, ... WHERE ...
  // bindValues 顺序：先 SET 的 ?，后 WHERE 的 ?
  const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:WHERE\s+(.+))?$/i)
  if (!match) return { rows: [], rowsAffected: 0 }
  const [, name, setStr, whereStr] = match
  const rows = db.rows.get(name) ?? []

  // 先消费 SET 的绑定值（对所有匹配行相同）
  const setAssignments = setStr.split(',').map((s) => s.trim())
  const setValues = setAssignments.map(() => bindValues.shift())

  // 再编译 WHERE（消费 WHERE 的绑定值）
  const whereCompiled = whereStr ? compileWhere(whereStr.trim(), bindValues) : null

  let affected = 0
  rows.forEach((r) => {
    const matched = whereCompiled ? matchRow(whereCompiled, r) : true
    if (matched) {
      setAssignments.forEach((_, i) => {
        const col = setAssignments[i].split('=')[0].trim()
        r[col] = setValues[i]
      })
      affected++
    }
  })
  return { rows: [], rowsAffected: affected }
}

function execDelete(sql: string, bindValues: unknown[]): ExecResult {
  const match = sql.match(/DELETE FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i)
  if (!match) return { rows: [], rowsAffected: 0 }
  const [, name, whereStr] = match
  const rows = db.rows.get(name) ?? []
  if (!whereStr) {
    const count = rows.length
    rows.length = 0
    return { rows: [], rowsAffected: count }
  }
  const whereCompiled = compileWhere(whereStr.trim(), bindValues)
  const before = rows.length
  for (let i = rows.length - 1; i >= 0; i--) {
    if (matchRow(whereCompiled, rows[i])) {
      rows.splice(i, 1)
    }
  }
  return { rows: [], rowsAffected: before - rows.length }
}

// ============ WHERE 编译与匹配（绑定值只消费一次） ============

type CompiledCondition =
  | { kind: 'cmp'; col: string; op: string; value: unknown }
  | { kind: 'like'; col: string; pattern: string }
  | { kind: 'in'; col: string; values: unknown[] }
  | { kind: 'null'; col: string; negated: boolean }

/// 编译 WHERE 表达式，一次性消费绑定值
function compileWhere(expr: string, bindValues: unknown[]): CompiledCondition[] {
  const andParts = splitTopLevel(expr, 'AND')
  return andParts.map((part) => compileCondition(part.trim(), bindValues))
}

function compileCondition(cond: string, bindValues: unknown[]): CompiledCondition {
  cond = cond.trim()
  if (cond.startsWith('(') && cond.endsWith(')')) {
    cond = cond.slice(1, -1).trim()
  }

  // col LIKE ?
  const likeMatch = cond.match(/(\w+)\s+LIKE\s+\?/i)
  if (likeMatch) {
    return { kind: 'like', col: likeMatch[1], pattern: String(bindValues.shift() ?? '') }
  }

  // col IN (?, ?, ...)
  const inMatch = cond.match(/(\w+)\s+IN\s*\(([^)]+)\)/i)
  if (inMatch) {
    const placeholders = inMatch[2].split(',').map((p) => p.trim())
    const values = placeholders.map((p) => (p === '?' ? bindValues.shift() : p))
    return { kind: 'in', col: inMatch[1], values }
  }

  // col IS [NOT] NULL
  const nullMatch = cond.match(/(\w+)\s+IS\s+(NOT\s+)?NULL/i)
  if (nullMatch) {
    return { kind: 'null', col: nullMatch[1], negated: !!nullMatch[2] }
  }

  // col OP ? （绑定值比较）
  const cmpBindMatch = cond.match(/(\w+)\s*(>=|<=|<>|!=|=|>|<)\s*\?/i)
  if (cmpBindMatch) {
    return { kind: 'cmp', col: cmpBindMatch[1], op: cmpBindMatch[2], value: bindValues.shift() }
  }

  // col OP '字面量'
  const cmpLitMatch = cond.match(/(\w+)\s*(>=|<=|<>|!=|=|>|<)\s*(['"]?[^'"\s]+['"]?)/i)
  if (cmpLitMatch) {
    const rawVal = cmpLitMatch[3].replace(/^['"]|['"]$/g, '')
    const numVal = Number(rawVal)
    const value = isNaN(numVal) ? rawVal : numVal
    return { kind: 'cmp', col: cmpLitMatch[1], op: cmpLitMatch[2], value }
  }

  // 无法识别的条件，恒真
  return { kind: 'cmp', col: '', op: '=', value: true }
}

function matchRow(conditions: CompiledCondition[], row: Row): boolean {
  return conditions.every((cond) => matchCondition(cond, row))
}

function matchCondition(cond: CompiledCondition, row: Row): boolean {
  switch (cond.kind) {
    case 'cmp': {
      const { col, op, value } = cond
      const rowVal = row[col]
      switch (op) {
        case '=': return rowVal == value
        case '<>':
        case '!=': return rowVal != value
        case '>': return Number(rowVal) > Number(value)
        case '<': return Number(rowVal) < Number(value)
        case '>=': return Number(rowVal) >= Number(value)
        case '<=': return Number(rowVal) <= Number(value)
        default: return true
      }
    }
    case 'like': {
      const value = String(row[cond.col] ?? '')
      const regex = new RegExp('^' + cond.pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$')
      return regex.test(value)
    }
    case 'in':
      return cond.values.includes(row[cond.col])
    case 'null': {
      const isNull = row[cond.col] == null
      return cond.negated ? !isNull : isNull
    }
    default:
      return true
  }
}

function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = []
  const sepRe = new RegExp(`\\b${sep}\\b`, 'gi')
  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = sepRe.exec(expr))) {
    parts.push(expr.slice(lastIdx, match.index))
    lastIdx = match.index + match[0].length
  }
  parts.push(expr.slice(lastIdx))
  return parts.filter((p) => p.trim().length > 0)
}

// ============ 事务快照（用于 executeTransaction 回滚） ============

function snapshotDb(): MockDatabase {
  const snap: MockDatabase = {
    tables: new Map(),
    rows: new Map(),
  }
  for (const [k, v] of db.tables) snap.tables.set(k, { columns: [...v.columns] })
  for (const [k, v] of db.rows) snap.rows.set(k, v.map((r) => ({ ...r })))
  return snap
}

function restoreDb(snap: MockDatabase): void {
  db.tables.clear()
  db.rows.clear()
  for (const [k, v] of snap.tables) db.tables.set(k, { columns: [...v.columns] })
  for (const [k, v] of snap.rows) db.rows.set(k, v.map((r) => ({ ...r })))
}
