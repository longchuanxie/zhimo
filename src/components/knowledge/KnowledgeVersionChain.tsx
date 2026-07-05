// 知识版本链路展示子组件
// 负责展示当前知识的上一个版本（被当前版本替换）与下一个版本（当前版本被谁替换）
// 用于 KnowledgeDetailPage，避免详情页组件进一步膨胀

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUturnUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { getPreviousVersion } from '@/services/knowledge/KnowledgeService'
import type { Knowledge } from '@/types'

interface KnowledgeVersionChainProps {
  /// 当前知识
  current: Knowledge
  /// 项目 ID（用于构建跳转链接）
  projectId: string
}

/// 知识版本链路展示
///
/// 展示三种关系：
/// 1. 上一个版本（被当前版本替换的旧版本）— 通过 getPreviousVersion 反查
/// 2. 下一个版本（当前版本被谁替换）— 通过 current.replacedById 直接展示
/// 3. 当前版本标识（v{version}）
///
/// 若没有任何版本关系（既无上一版也无下一版，且为 v1），返回 null，区块不渲染
export function KnowledgeVersionChain({ current, projectId }: KnowledgeVersionChainProps) {
  const [previous, setPrevious] = useState<Knowledge | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const result = await getPreviousVersion(current.id)
      if (!cancelled) {
        setPrevious(result.ok ? result.data : null)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [current.id])

  const hasPrevious = previous !== null
  const hasNext = !!current.replacedById

  // 既无上一版也无下一版，且为 v1 → 不渲染
  if (!hasPrevious && !hasNext && current.version === 1) return null

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <AppIcon icon={ArrowUturnUpIcon} size="sm" />
        版本演进
      </div>

      {/* 上一个版本 */}
      {loading ? (
        <div className="text-xs text-muted">加载版本链路...</div>
      ) : hasPrevious ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-subtle">上一个版本：</span>
          <Link
            to={`/projects/${projectId}/knowledge/${previous!.id}`}
            className="text-brand hover:underline"
          >
            v{previous!.version} · {previous!.title}
          </Link>
          <span className="text-xs text-muted">（已被当前版本替换）</span>
        </div>
      ) : null}

      {/* 当前版本 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-subtle">当前版本：</span>
        <span className="px-2 py-0.5 rounded bg-brand-soft text-brand text-xs font-semibold">
          v{current.version}
        </span>
      </div>

      {/* 下一个版本 */}
      {hasNext ? (
        <div className="flex items-center gap-2 text-sm">
          <AppIcon icon={ArrowDownIcon} size="sm" className="text-muted" />
          <span className="text-subtle">已被新版本替换：</span>
          <Link
            to={`/projects/${projectId}/knowledge/${current.replacedById}`}
            className="text-brand hover:underline"
          >
            查看新版本
          </Link>
        </div>
      ) : null}
    </div>
  )
}
