import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles.css'

// TanStack Query 客户端：管理本地 Service 数据缓存
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 桌面客户端本地数据，重试策略保守
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30, // 30 秒内不重新请求
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
