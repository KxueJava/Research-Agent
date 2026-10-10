import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { createToolProxyConfig } from './toolProxy';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        crypto: 'crypto-browserify',
        'use-sync-external-store/shim': path.resolve(
          __dirname,
          'src/shims/use-sync-external-store/shim.ts'
        ),
        'use-sync-external-store/shim/with-selector': path.resolve(
          __dirname,
          'src/shims/use-sync-external-store/with-selector.ts'
        ),
      },
    },
    css: {preprocessorOptions: {less: {javascriptEnabled: true},},},
    optimizeDeps: {
      exclude: [
        'clsx',
        'nanoid',
        'radix-ui',
        'lucide-react',
        'tailwind-merge',
      ],
    },
    server: {
      // 修改为监听所有接口，而不是特定主机名
      host: '0.0.0.0',
      port: 3001,
      allowedHosts: true,
      proxy: {
        '/web': {
          target: env.SERVICE_BASE_URL,
          changeOrigin: true,
        },
        // 管理接口使用 /api 前缀；开发环境必须转发到 Spring Boot，
        // 否则浏览器会把请求发给 Vite 自身并得到 404。
        '/api': {
          target: env.SERVICE_BASE_URL,
          changeOrigin: true,
        },
        '/tool': createToolProxyConfig(env.RESEARCH_TOOL_BASE_URL),
      },
    },
    define: {
      // 一定要序列化，否则打包时会报错
      SERVICE_BASE_URL: JSON.stringify(env.SERVICE_BASE_URL),
      RESEARCH_TOOL_BASE_URL: JSON.stringify(env.RESEARCH_TOOL_BASE_URL || ''),
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser' as const,
    },
  }
});
