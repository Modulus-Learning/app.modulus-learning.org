import type { NextConfig } from 'next'

// Next loads `.env` (committed, public values only) and `.env.local`
// (gitignored secrets) itself. The public values use the `VITE_*` names shared
// with the TanStack Start app, so they are forwarded to the client bundle
// explicitly here; Next only inlines `NEXT_PUBLIC_*` on its own.
const publicEnvKeys = [
  'VITE_SITE_NAME',
  'VITE_SITE_DESCRIPTION',
  'VITE_PUBLIC_SERVER_URL',
  'VITE_CSP_ENABLED',
  'VITE_RECAPTCHA_ENABLED',
  'VITE_RECAPTCHA_MANDATORY',
  'VITE_RECAPTCHA_SITE_KEY',
] as const

const nextConfig: NextConfig = {
  env: Object.fromEntries(publicEnvKeys.map((key) => [key, process.env[key] ?? ''])),
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
