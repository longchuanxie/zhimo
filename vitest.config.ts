import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 测试配置：与 vite.config.ts 的 alias 对齐，使用 jsdom 环境运行组件/Service 测试
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/utils/**', 'src/hooks/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
})
