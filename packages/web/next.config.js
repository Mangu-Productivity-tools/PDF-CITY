/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Slim, self-contained runtime output (see Dockerfile) — traces only the
  // node_modules actually needed to run `node server.js` in production.
  output: 'standalone',
};

module.exports = nextConfig;
