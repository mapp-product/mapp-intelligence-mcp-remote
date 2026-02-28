/**
 * Compatibility MCP endpoint for clients that append `/mcp` automatically.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAuth0Token } from "@/lib/auth";
import { registerChatGptTools } from "@/lib/chatgpt-tools";
import { logMcpEvent } from "@/lib/mcp-event-logger";

function createBaseHandler() {
  return createMcpHandler(
    (server) => {
      registerChatGptTools(server);
    },
    {},
    {
      streamableHttpEndpoint: "/api/mcp-chatgpt/mcp",
      sseEndpoint: "/api/mcp-chatgpt/sse",
      sseMessageEndpoint: "/api/mcp-chatgpt/message",
      maxDuration: 120,
      verboseLogs: process.env.NODE_ENV !== "production",
      onEvent: (event) => logMcpEvent("chatgpt-compat", event),
    }
  );
}

const verifyToken = async (_req: Request, bearerToken?: string) => {
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
