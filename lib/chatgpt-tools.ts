import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ANALYTICS_WIDGET_HTML,
  KPI_WIDGET_HTML,
} from "./chatgpt-widget-templates";
import {
  deriveSuccessOutcome,
  mapToolError,
  summarizeErrorForLog,
} from "./tool-error-mapping";
import {
  getUnifiedToolDefinitions,
  type UnifiedToolCategory,
  type UnifiedToolDefinition,
} from "./unified-tool-definitions";

const ANALYTICS_WIDGET_URI = "ui://widget/analytics.html";
const KPI_WIDGET_URI = "ui://widget/kpi.html";

const securitySchemes = [{ type: "oauth2", scopes: [] }];

const structuredOutputSchema = {
  tool: z.string(),
  category: z.enum(["discovery", "usage", "analysis", "report"]),
  data: z.unknown(),
  summary: z.object({
    kind: z.enum(["object", "array", "primitive", "null"]),
    keys: z.array(z.string()),
    rowCount: z.number().nullable(),
    warnings: z.array(z.string()),
  }),
};

interface ToolResultSummary {
  kind: "object" | "array" | "primitive" | "null";
  keys: string[];
  rowCount: number | null;
  warnings: string[];
}

function logToolOutcome(payload: Record<string, unknown>): void {
  console.info(`[tool-outcome] ${JSON.stringify(payload)}`);
}

function buildToolMeta(resourceUri: string): Record<string, unknown> {
  return {
    securitySchemes,
    "openai/outputTemplate": resourceUri,
    "openai/toolInvocation/invoking": "Running analytics query...",
    "openai/toolInvocation/invoked": "Analytics query complete.",
    ui: {
      resourceUri,
      visibility: "public",
    },
  };
}

function buildResourceMeta(
  description: string,
  prefersBorder: boolean
): Record<string, unknown> {
  const csp = {
    connect_domains: [],
    resource_domains: [],
  };

  return {
    ui: {
      prefersBorder,
      csp,
    },
    "openai/widgetDescription": description,
    "openai/widgetPrefersBorder": prefersBorder,
    "openai/widgetCSP": csp,
  };
}

function getResourceUriForCategory(category: UnifiedToolCategory): string {
  if (category === "usage") return KPI_WIDGET_URI;
  return ANALYTICS_WIDGET_URI;
}

function payloadToJsonText(payload: unknown): string {
  const text = JSON.stringify(payload, null, 2);
  return typeof text === "string" ? text : String(payload);
}

function summarizePayload(payload: unknown): ToolResultSummary {
  if (payload === null || payload === undefined) {
    return {
      kind: "null",
      keys: [],
      rowCount: null,
      warnings: [],
    };
  }

  if (Array.isArray(payload)) {
    return {
      kind: "array",
      keys: [],
      rowCount: payload.length,
      warnings: [],
    };
  }

  if (typeof payload !== "object") {
    return {
      kind: "primitive",
      keys: [],
      rowCount: null,
      warnings: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const rowCount = Array.isArray(record.rows) ? record.rows.length : null;

  const warnings: string[] = [];
  if (typeof record.maximum === "number" && record.maximum === 0) {
    warnings.push(
      "[WARN_QUOTA_ZERO] Analysis quota maximum is 0 for this account. Analysis API calculations may be disabled."
    );
  }

  return {
    kind: "object",
    keys: Object.keys(record).slice(0, 25),
    rowCount,
    warnings,
  };
}

function toChatGptToolResult(
  tool: UnifiedToolDefinition,
  payload: unknown,
  resourceUri: string
) {
  const summary = summarizePayload(payload);

  const structuredContent = {
    tool: tool.name,
    category: tool.category,
    data: payload,
    summary,
  };

  return {
    content: [{ type: "text" as const, text: payloadToJsonText(payload) }],
    structuredContent,
    _meta: {
      ui: {
        resourceUri,
      },
      "openai/outputTemplate": resourceUri,
      widgetData: structuredContent,
    },
  };
}

function registerWidgetResources(server: McpServer): void {
  server.registerResource(
    "analytics-widget",
    ANALYTICS_WIDGET_URI,
    {
      title: "Analytics Chart Widget",
      description:
        "Renders table and chart-oriented analytics output in a compact widget.",
      mimeType: "text/html",
      _meta: buildResourceMeta(
        "Interactive analytics table and chart view for website analysis.",
        true
      ),
    },
    async () => ({
      contents: [
        {
          uri: ANALYTICS_WIDGET_URI,
          mimeType: "text/html",
          text: ANALYTICS_WIDGET_HTML,
        },
      ],
    })
  );

  server.registerResource(
    "kpi-widget",
    KPI_WIDGET_URI,
    {
      title: "KPI Snapshot Widget",
      description: "Renders KPI cards and period deltas.",
      mimeType: "text/html",
      _meta: buildResourceMeta(
        "Interactive KPI cards with baseline deltas for quick performance checks.",
        true
      ),
    },
    async () => ({
      contents: [
        {
          uri: KPI_WIDGET_URI,
          mimeType: "text/html",
          text: KPI_WIDGET_HTML,
        },
      ],
    })
  );
}

function registerInstrumentedTool(
  server: McpServer,
  tool: UnifiedToolDefinition
): void {
  const resourceUri = getResourceUriForCategory(tool.category);
  const annotations = tool.name.startsWith("cancel_")
    ? { readOnlyHint: false }
    : { readOnlyHint: true };

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      annotations,
      inputSchema: tool.inputSchema,
      outputSchema: structuredOutputSchema,
      _meta: buildToolMeta(resourceUri),
    },
    async (args, context) => {
      const startedAt = Date.now();

      try {
        const result = await tool.execute(args, {
          authInfo: context.authInfo
            ? {
                extra: context.authInfo.extra,
              }
            : undefined,
        });

        const outcome = deriveSuccessOutcome(tool.name, result);

        logToolOutcome({
          tool: tool.name,
          status: "success",
          outcomeCode: outcome.outcomeCode,
          durationMs: Date.now() - startedAt,
          ...(outcome.details || {}),
        });

        return toChatGptToolResult(tool, result, resourceUri);
      } catch (error) {
        const mapped = mapToolError(error);

        logToolOutcome({
          tool: tool.name,
          status: "error",
          outcomeCode: mapped.code,
          durationMs: Date.now() - startedAt,
          message: summarizeErrorForLog(mapped.message),
        });

        throw new Error(`[${mapped.code}] ${mapped.message}`);
      }
    }
  );
}

export function registerChatGptTools(server: McpServer): void {
  registerWidgetResources(server);

  for (const tool of getUnifiedToolDefinitions()) {
    registerInstrumentedTool(server, tool);
  }
}
