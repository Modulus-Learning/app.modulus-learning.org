import path from 'node:path'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv } from 'vite'

const httpsConfig = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cert = env.TLS_CERT_FILE
  const key = env.TLS_KEY_FILE
  const origin = env.ORIGIN

  if (cert != null && key != null && origin != null) {
    return {
      https: { cert, key },
      host: '0.0.0.0',
      origin,
    }
  }

  return {}
}

export default defineConfig(({ mode }) => ({
  plugins: [tanstackRouter({ autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    ...httpsConfig(mode),
  },
}))
