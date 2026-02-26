/**
 * MCP endpoint — Streamable HTTP transport with Auth0 OAuth protection.
 *
 * This is the main MCP server endpoint that Claude and other MCP clients
 * connect to. It validates Auth0 JWT tokens and resolves per-user Mapp
 * credentials for each tool call.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAuth0Token } from "@/lib/auth";
import { registerTools } from "@/lib/tools";

// Create the base MCP handler with all Mapp Intelligence tools
const baseHandler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {},
  {
    basePath: "/api",
    maxDuration: 120,
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);

// Token verification callback for MCP auth
const verifyToken = async (
  _req: Request,
  bearerToken?: string
) => {
  if (!bearerToken) return undefined;

  const payload = await verifyAuth0Token(bearerToken);
  if (!payload) return undefined;

  return {
    token: bearerToken,
    scopes: payload.scope ? payload.scope.split(" ") : [],
    clientId: payload.sub,
    extra: {
      sub: payload.sub,
      iss: payload.iss,
    },
  };
};

// Wrap with OAuth auth
const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { handler as GET, handler as POST, handler as DELETE };
