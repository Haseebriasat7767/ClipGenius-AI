/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      'pg',
      'pg-boss',
      'stripe',
      'nodemailer',
      '@ffmpeg-installer/ffmpeg',
      '@ffprobe-installer/ffprobe',
      'embedded-postgres',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Allow the app to be embedded in the Arena live-preview iframe while
          // still blocking arbitrary sites. Override with ALLOW_FRAME_ANCESTORS.
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${process.env.ALLOW_FRAME_ANCESTORS ?? "'self' https://*.arena.ai https://arena.ai https://*.e2b.app"}`,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
