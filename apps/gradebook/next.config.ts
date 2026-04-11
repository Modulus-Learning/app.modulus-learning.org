import { resolve } from 'node:path'

import { config } from 'dotenv'
import type { NextConfig } from 'next'

// Disable dotenv tips/messages
process.env.DOTENV_CONFIG_QUIET = 'true'

// Load .env.public first, then .env (so that .env can override)
config({ path: resolve(process.cwd(), '.env.public') })
config({ path: resolve(process.cwd(), '.env') })

const nextConfig: NextConfig = {
  output: 'standalone',
  // skipTrailingSlashRedirect: true,
  // skipMiddlewareUrlNormalize: true,
  serverExternalPackages: ['argon2'],
  turbopack: {
    resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // reactCompiler: false,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.modulus.org',
        pathname: '/**',
      },
    ],
  },
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
}

export default nextConfig
