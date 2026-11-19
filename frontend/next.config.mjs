/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The demo's "AI reasoning" mode talks to the Python LangChain backend
  // (../backend, FastAPI). Proxying it through the Next server means the
  // client can keep calling /api/agent-demo with no CORS setup, and the
  // backend URL stays a server-side concern.
  //
  // If the backend isn't running, the proxied request simply fails and the
  // client falls back to its built-in rule-based pipeline.
  async rewrites() {
    const backend = process.env.AGENT_BACKEND_URL ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/agent-demo",
        destination: `${backend}/agent-demo`,
      },
    ];
  },
};

export default nextConfig;
