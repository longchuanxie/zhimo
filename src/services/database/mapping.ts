// 数据库行映射工具
// SQLite 返回的行是 snake_case 对象，需要转换为 TypeScript 的 camelCase 类型

/// 将数据库行（snake_case）转换为实体（camelCase）
/// 注意：JSON 字段需要手动反序列化
export function mapRow<T>(
  row: Record<string, unknown>,
  fieldMap: Record<keyof T, string>,
): T {
  const result = {} as T
  for (const [tsKey, dbKey] of Object.entries(fieldMap)) {
    const value = row[dbKey as string]
    ;(result as Record<string, unknown>)[tsKey] = value
  }
  return result
}

/// 安全解析 JSON 字段
export function parseJsonField<T>(value: unknown, defaultValue: T): T {
  if (value == null) return defaultValue
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

/// 安全序列化 JSON 字段
export function stringifyJsonField(value: unknown): string | null {
  if (value == null) return null
  return JSON.stringify(value)
}

/// 将字符串数组序列化为 JSON 字符串（用于 tags/keywords 等字段）
export function stringifyStringArray(arr: string[] | null): string | null {
  if (arr == null) return null
  return JSON.stringify(arr)
}

/// 将 JSON 字符串反序列化为字符串数组
export function parseStringArray(value: unknown): string[] | null {
  if (value == null) return null
  if (typeof value !== 'string') return value as string[]
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/// 生成 UUID v4
export function generateId(): string {
  // 使用 crypto.randomUUID（现代浏览器/Tauri WebView 均支持）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // 降级方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/// 获取当前 ISO 时间戳
export function now(): string {
  return new Date().toISOString()
}
