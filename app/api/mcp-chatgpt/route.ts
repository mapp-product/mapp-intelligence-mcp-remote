/**
 * ChatGPT-focused MCP endpoint.
 *
 * Keeps the existing /api/mcp endpoint unchanged for Claude/Cursor clients,
 * while providing a curated tool and widget contract optimized for ChatGPT.
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
      // Bind this handler directly to the custom endpoint path.
      // Using basePath "/api" would make mcp-handler expect "/api/mcp".
      streamableHttpEndpoint: "/api/mcp-chatgpt",
      sseEndpoint: "/api/mcp-chatgpt/sse",
      sseMessageEndpoint: "/api/mcp-chatgpt/message",
      maxDuration: 120,
      verboseLogs: process.env.NODE_ENV !== "production",
      onEvent: (event) => logMcpEvent("chatgpt", event),
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
