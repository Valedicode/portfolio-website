/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The demo's "AI reasoning" mode talks to the Python LangChain backend
  // (../backend, FastAPI) through the server route in app/api/agent-demo,
  // which adds the shared secret and visitor IP. If the backend is down or
  // blocks the request, the client falls back to its rule-based pipeline.
};

export default nextConfig;
