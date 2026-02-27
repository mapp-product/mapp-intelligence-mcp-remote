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

function createBaseHandler() {
  return createMcpHandler(
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
}

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
    clientId:
      typeof payload.azp === "string"
        ? payload.azp
        : typeof payload.client_id === "string"
          ? payload.client_id
          : payload.sub,
    extra: {
      sub: payload.sub,
      iss: payload.iss,
    },
  };
};

function createAuthedHandler() {
  return withMcpAuth(createBaseHandler(), verifyToken, {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  });
}

async function handle(req: Request): Promise<Response> {
  return createAuthedHandler()(req);
}

export { handle as GET, handle as POST, handle as DELETE };
