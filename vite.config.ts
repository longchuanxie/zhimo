import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri 期望前端开发服务器监听在一个固定端口
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 不监听 Rust 源码变更
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // 为桌面客户端生产更小的包
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
  },
}))
