import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Vercel serverless functions used by MCP
  serverExternalPackages: ["mcp-handler"],
};

export default nextConfig;
