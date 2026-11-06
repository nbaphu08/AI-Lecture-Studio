/** @type {import('next').NextConfig} */
const nextConfig = {
  // No static export: /api/analyze is a server-side Route Handler (it holds the Gemini API key).
  reactStrictMode: true,
  // Ship the HTTP security basics; the app embeds nothing from other origins.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
