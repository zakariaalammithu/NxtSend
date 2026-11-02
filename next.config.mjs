/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Microphone is intentionally NOT disabled: the app's voice
          // note composer uses it. Camera/geolocation are unused.
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
