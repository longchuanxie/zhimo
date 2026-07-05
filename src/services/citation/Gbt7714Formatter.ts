// GB/T 7714-2015 参考文献格式化器
// 纯函数模块,无副作用,无 DB 访问
// 严格遵循《GB/T 7714-2015 信息与文献 参考文献著录规则》
//
// 文献类型标识:
//   期刊 [J] / 专著 [M] / 会议 [C] / 学位论文 [D] / 电子文献 [EB/OL] / 其他 [Z]

import type {
  Reference,
  ReferenceEntryType,
  Citation,
  CitationStyle,
  CitationFormat,
  AuthorInfo,
} from '@/types'

// ============ 工具函数 ============

/// 检测字符串是否含 CJK 字符(用于判断中英文作者)
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/
export function isChineseText(text: string): boolean {
  return CJK_REGEX.test(text)
}

/// 检测作者列表是否为中文作者(以第一位作者为准)
function isChineseAuthors(authors: AuthorInfo[]): boolean {
  if (authors.length === 0) return false
  return isChineseText(authors[0]!.name)
}

/// 格式化作者列表(GB/T 7714:超过 3 人显示前 3 + ", 等"/", et al.")
export function formatAuthors(authors: AuthorInfo[]): string {
  if (authors.length === 0) return '佚名'

  const isChinese = isChineseAuthors(authors)
  // 提取作者名(忽略 affiliation,GB/T 7714 著者-年制不显示机构)
  const names = authors.map((a) => a.name.trim()).filter(Boolean)

  if (names.length === 0) return '佚名'

  if (names.length <= 3) {
    return names.join(', ')
  }

  // 超过 3 人:前 3 人 + 省略
  const first3 = names.slice(0, 3).join(', ')
  return isChinese ? `${first3}, 等` : `${first3}, et al.`
}

/// 格式化年份
function formatYear(year: number | null): string {
  return year == null ? '' : String(year)
}

/// 格式化卷(期)
function formatVolumeIssue(volume: string | null, issue: string | null): string {
  if (volume && issue) return `${volume}(${issue})`
  if (volume) return volume
  if (issue) return `(${issue})`
  return ''
}

/// 格式化页码
function formatPages(pages: string | null): string {
  return pages ?? ''
}

// ============ 文献类型标识映射 ============

const ENTRY_TYPE_LABEL: Record<ReferenceEntryType, string> = {
  journal: 'J',
  book: 'M',
  conference: 'C',
  thesis: 'D',
  web: 'EB/OL',
  other: 'Z',
}

/// 获取文献类型标识(如 [J]、[M])
export function getEntryTypeLabel(entryType: ReferenceEntryType): string {
  return `[${ENTRY_TYPE_LABEL[entryType]}]`
}

// ============ 主格式化函数 ============

/// 按 GB/T 7714-2015 格式化参考文献条目
/// 严格遵循国标示例,各 entryType 格式如下:
///   期刊: 作者. 题名[J]. 刊名, 年, 卷(期): 起止页码.
///   专著: 作者. 书名[M]. 出版地: 出版者, 年: 起止页码.
///   会议: 作者. 题名[C]//会议名. 出版地: 出版者, 年: 起止页码.
///   学位论文: 作者. 题名[D]. 保存地: 保存单位, 年.
///   电子文献: 作者. 题名[EB/OL]. (发布日期)[引用日期]. URL.
///   其他: 作者. 题名[Z]. 出版地: 出版者, 年.
export function formatReference(reference: Reference): string {
  const authors = formatAuthors(reference.authors)
  const title = reference.title.trim()
  const typeLabel = getEntryTypeLabel(reference.entryType)
  const year = formatYear(reference.year)

  switch (reference.entryType) {
    case 'journal':
      return formatJournal(authors, title, typeLabel, reference, year)
    case 'book':
      return formatBook(authors, title, typeLabel, reference, year)
    case 'conference':
      return formatConference(authors, title, typeLabel, reference, year)
    case 'thesis':
      return formatThesis(authors, title, typeLabel, reference, year)
    case 'web':
      return formatWeb(authors, title, typeLabel, reference, year)
    case 'other':
    default:
      return formatOther(authors, title, typeLabel, reference, year)
  }
}

/// 期刊文章 [J]:作者. 题名[J]. 刊名, 年, 卷(期): 起止页码.
function formatJournal(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  // 刊名, 年, 卷(期): 页码
  const locationParts: string[] = []
  if (ref.container) locationParts.push(ref.container)
  if (year) locationParts.push(year)

  const volIssue = formatVolumeIssue(ref.volume, ref.issue)
  if (volIssue) locationParts.push(volIssue)

  const pages = formatPages(ref.pages)
  if (pages) {
    locationParts.push(pages.includes('-') ? pages : `${pages}.`)
  }

  if (locationParts.length > 0) {
    // 刊名, 年, 卷(期): 页码.
    let locationStr = locationParts.join(', ')
    if (pages) {
      // 将最后一个 ", 页码" 改为 ": 页码."
      locationStr = locationParts.slice(0, -1).join(', ')
      locationStr = locationStr ? `${locationStr}: ${pages}.` : `${pages}.`
    } else {
      locationStr = `${locationStr}.`
    }
    parts.push(locationStr)
  } else {
    parts.push('')
  }

  return parts.filter(Boolean).join(' ')
}

/// 专著 [M]:作者. 书名[M]. 出版地: 出版者, 年: 起止页码.
function formatBook(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  // 出版地: 出版者, 年: 页码.
  const pubParts: string[] = []
  if (ref.city && ref.publisher) {
    pubParts.push(`${ref.city}: ${ref.publisher}`)
  } else if (ref.publisher) {
    pubParts.push(ref.publisher)
  } else if (ref.city) {
    pubParts.push(ref.city)
  }

  if (year) pubParts.push(year)

  const pages = formatPages(ref.pages)
  if (pages) {
    pubParts.push(pages)
  }

  if (pubParts.length > 0) {
    let pubStr = pubParts.join(', ')
    if (pages) {
      // 将最后一个 ", 页码" 改为 ": 页码."
      const before = pubParts.slice(0, -1).join(', ')
      pubStr = before ? `${before}: ${pages}.` : `${pages}.`
    } else {
      pubStr = `${pubStr}.`
    }
    parts.push(pubStr)
  } else {
    parts.push('')
  }

  return parts.filter(Boolean).join(' ')
}

/// 会议论文 [C]:作者. 题名[C]//会议名. 出版地: 出版者, 年: 起止页码.
function formatConference(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  // //会议名. 出版地: 出版者, 年: 页码.
  let confStr = ''
  if (ref.container) {
    confStr = `//${ref.container}`
  }

  const pubParts: string[] = []
  if (ref.city && ref.publisher) {
    pubParts.push(`${ref.city}: ${ref.publisher}`)
  } else if (ref.publisher) {
    pubParts.push(ref.publisher)
  }

  if (year) pubParts.push(year)

  const pages = formatPages(ref.pages)
  if (pages) pubParts.push(pages)

  if (pubParts.length > 0) {
    let pubStr = pubParts.join(', ')
    if (pages) {
      const before = pubParts.slice(0, -1).join(', ')
      pubStr = before ? `${before}: ${pages}.` : `${pages}.`
    } else {
      pubStr = `${pubStr}.`
    }
    confStr = confStr ? `${confStr}. ${pubStr}` : pubStr
  } else if (confStr) {
    confStr = `${confStr}.`
  }

  if (confStr) parts.push(confStr)

  return parts.filter(Boolean).join(' ')
}

/// 学位论文 [D]:作者. 题名[D]. 保存地: 保存单位, 年.
function formatThesis(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  // 保存地: 保存单位, 年.
  const locParts: string[] = []
  if (ref.city && ref.publisher) {
    // 学位论文中 publisher 字段复用为"保存单位"
    locParts.push(`${ref.city}: ${ref.publisher}`)
  } else if (ref.publisher) {
    locParts.push(ref.publisher)
  }

  if (year) locParts.push(year)

  if (locParts.length > 0) {
    parts.push(`${locParts.join(', ')}.`)
  }

  return parts.filter(Boolean).join(' ')
}

/// 电子文献 [EB/OL]:作者. 题名[EB/OL]. (发布日期)[引用日期]. URL.
function formatWeb(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  // (发布日期)[引用日期]. URL.
  const dateParts: string[] = []
  if (year) {
    // 发布日期用年份简化(MVP)
    dateParts.push(`(${year})`)
  }

  if (ref.accessDate) {
    const accessDate = formatDate(ref.accessDate)
    if (accessDate) {
      dateParts.push(`[${accessDate}]`)
    }
  }

  if (dateParts.length > 0) {
    parts.push(dateParts.join(''))
  }

  if (ref.url) {
    parts.push(`${ref.url}.`)
  }

  return parts.filter(Boolean).join(' ')
}

/// 其他 [Z]:作者. 题名[Z]. 出版地: 出版者, 年.
function formatOther(
  authors: string,
  title: string,
  typeLabel: string,
  ref: Reference,
  year: string,
): string {
  const parts: string[] = [`${authors}. ${title}${typeLabel}.`]

  const pubParts: string[] = []
  if (ref.city && ref.publisher) {
    pubParts.push(`${ref.city}: ${ref.publisher}`)
  } else if (ref.publisher) {
    pubParts.push(ref.publisher)
  }

  if (year) pubParts.push(year)

  if (pubParts.length > 0) {
    parts.push(`${pubParts.join(', ')}.`)
  }

  return parts.filter(Boolean).join(' ')
}

/// 格式化 ISO 日期为 yyyy-MM-dd(GB/T 7714 引用日期格式)
function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return ''
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  } catch {
    return ''
  }
}

// ============ 行内引文文本生成 ============

/// 生成行内引文显示文本
/// numeric 格式:[1] / [1, p.123] / 见[1, 第2版]
/// author_year 格式:(Smith, 2020) / (Smith, 2020, p.123) / 见(Smith, 2020, 第2版)
export function formatInlineText(
  citation: Citation,
  reference: Reference,
  style: CitationStyle,
  numericNumber?: number,
): string {
  const format: CitationFormat = citation.citationFormat

  // 生成核心引文文本
  let coreText: string
  if (format === 'numeric') {
    const num = numericNumber ?? 0
    coreText = num > 0 ? `[${num}]` : '[?]'
  } else {
    // author_year
    const firstAuthor = reference.authors[0]?.name ?? '佚名'
    const year = reference.year ?? '无年份'
    coreText = `(${firstAuthor}, ${year})`
  }

  // 添加 locator(页码定位)
  let innerText = coreText
  if (citation.locator) {
    if (format === 'numeric') {
      // [1, p.123]
      innerText = `[${numericNumber ?? '?'}, ${citation.locator}]`
    } else {
      // (Smith, 2020, p.123)
      const firstAuthor = reference.authors[0]?.name ?? '佚名'
      const year = reference.year ?? '无年份'
      innerText = `(${firstAuthor}, ${year}, ${citation.locator})`
    }
  }

  // 添加 prefix/suffix
  const prefix = citation.prefix ? `${citation.prefix} ` : ''
  const suffix = citation.suffix ? ` ${citation.suffix}` : ''

  // style 参数预留(MVP 仅 gbt7714_2015,格式一致)
  void style

  return `${prefix}${innerText}${suffix}`
}

// ============ 批量生成参考文献表 ============

/// 生成参考文献表(按引用顺序,去重)
/// 输入:citation 列表(已按出现顺序排序) + 对应的 reference 映射
/// 输出:格式化字符串数组,每项前加 [n] 编号
export function formatBibliography(
  citations: Citation[],
  references: Map<string, Reference>,
): string[] {
  const seen = new Set<string>()
  const ordered: Reference[] = []

  for (const citation of citations) {
    const ref = references.get(citation.referenceId)
    if (!ref || ref.isDeleted) continue
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    ordered.push(ref)
  }

  return ordered.map((ref, idx) => {
    const formatted = formatReference(ref)
    return `[${idx + 1}] ${formatted}`
  })
}
