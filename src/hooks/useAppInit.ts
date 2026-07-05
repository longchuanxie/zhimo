// 应用初始化 Hook
// 在应用启动时执行初始化流程

import { useEffect, useState } from 'react'
import { initializeApp, type InitState } from '@/services/appInit'

export function useAppInit() {
  const [state, setState] = useState<InitState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    async function run() {
      setState({ status: 'initializing' })

      const result = await initializeApp()

      if (cancelled) return

      if (result.ok) {
        setState({ status: 'ready' })
      } else {
        setState({
          status: 'error',
          message: result.error.message,
        })
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
