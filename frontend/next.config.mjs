/**
 * Baseline security headers for every route. A full Content-Security-Policy
 * is deliberately left out: the theme script and Framer Motion's inline
 * styles would need 'unsafe-inline', which removes most of its value.
 */
const SECURITY_HEADERS = [
  // Never guess content types (stops a served file being run as a script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The site never needs to be framed: blocks clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No "X-Powered-By: Next.js" header.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  // The demo talks to the Python LangChain backend (../backend, FastAPI)
  // through the server route in app/api/agent-demo, which adds the shared
  // secret and visitor IP. If the backend is down or blocks the request,
  // the client falls back to its rule-based pipeline.
};

export default nextConfig;
