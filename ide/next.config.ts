import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self' data:;
  worker-src 'self' blob:;
  connect-src 'self' https: wss:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // swcMinify and optimizeCss are enabled by default in Next.js 15+
  // swcMinify is no longer a top-level option in Next.js 15
  compress: true,
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // Filesystem caching for improved build performance
    if (!dev) {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
    }

    // Deterministic module IDs prevent cache busting on unrelated changes
    config.optimization.moduleIds = 'deterministic';
    // Single runtime chunk reduces duplication
    config.optimization.runtimeChunk = 'single';

    // Aggressive code splitting for client-side only
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        minChunks: 1,
        cacheGroups: {
          framework: {
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler|next)[\\/]/,
            priority: 40,
            enforce: true,
          },
          commons: {
            name: 'commons',
            minChunks: 2,
            priority: 20,
            reuseExistingChunk: true,
          },
          lib: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              const match = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
              return `npm.${match[1].replace('@', '')}`;
            },
            priority: 10,
            minChunks: 2,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
};

export default nextConfig;