/**
 * Mapp Intelligence MCP tools registration.
 *
 * Registers the canonical 13-tool contract used by generic MCP clients.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUnifiedToolDefinitions } from "./unified-tool-definitions";

function toTextToolResult(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text: typeof text === "string" ? text : String(payload),
      },
    ],
  };
}

export function registerTools(server: McpServer): void {
  for (const tool of getUnifiedToolDefinitions()) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (args, context) => {
        const result = await tool.execute(args, {
          authInfo: context.authInfo
            ? {
                extra: context.authInfo.extra,
              }
            : undefined,
        });

        return toTextToolResult(result);
      }
    );
  }
}
