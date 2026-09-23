/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * Emits a self-contained server under `.next/standalone`, carrying only the
   * dependencies actually reached at runtime.
   *
   * It is what lets the container's final stage copy a build output instead of
   * a `node_modules` tree, which is the difference between an image of a few
   * hundred megabytes and one of well over a gigabyte. It changes nothing about
   * `npm run dev` or `npm start` locally.
   */
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // The portal asks for none of these, so no page of it may.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
