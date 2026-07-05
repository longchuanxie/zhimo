// 通用异步数据获取 Hook
// 统一管理 loading / error / data 状态，避免页面重复实现
// 支持手动刷新和依赖重新获取

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServiceResult } from '@/types/service'
import type { AppError } from '@/types/error'

type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppError }

type AsyncFn<T> = () => Promise<ServiceResult<T>>

type UseAsyncOptions = {
  /// 依赖变化时是否自动重新获取，默认 true
  enabled?: boolean
}

/// 通用异步数据获取
/// 用法：const { state, refresh } = useAsync(() => listProjects(), [])
export function useAsync<T>(
  fn: AsyncFn<T>,
  deps: unknown[],
  options: UseAsyncOptions = {},
) {
  const { enabled = true } = options
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const fnRef = useRef(fn)
  fnRef.current = fn

  const execute = useCallback(async () => {
    setState({ status: 'loading' })
    const result = await fnRef.current()
    if (result.ok) {
      setState({ status: 'success', data: result.data })
    } else {
      setState({ status: 'error', error: result.error })
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function run() {
      setState({ status: 'loading' })
      const result = await fnRef.current()
      if (cancelled) return
      if (result.ok) {
        setState({ status: 'success', data: result.data })
      } else {
        setState({ status: 'error', error: result.error })
      }
    }

    run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { state, refresh: execute }
}
