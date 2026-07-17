import type { NextConfig } from 'next'

const nextConfig: NextConfig = { env: { E2E_COMPILED: process.env.E2E_COMPILE === '1' ? '1' : '0' } }

export default nextConfig
