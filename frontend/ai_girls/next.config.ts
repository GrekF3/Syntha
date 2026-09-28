import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const origin = process.env.API_ORIGIN || 'http://127.0.0.1:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${origin}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${origin}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
