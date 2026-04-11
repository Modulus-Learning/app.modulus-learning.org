import tailwindcss from '@tailwindcss/vite'
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
  plugins: [tailwindcss()],
  server: {
    port: 5174,
    ...httpsConfig(mode),
  },
}))
