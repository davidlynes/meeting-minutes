/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '',
  assetPrefix: '/',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      }
    }
    // Optional native Capacitor plugins — not available in browser dev mode
    config.externals = [
      ...(config.externals || []),
      '@capacitor-community/secure-storage',
      '@aparajita/capacitor-biometric-auth',
    ]
    return config
  },
}

module.exports = nextConfig
