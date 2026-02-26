/**
 * Mapp Intelligence MCP tools registration.
 *
 * Ports all 13 tools from the original local MCP server to the remote
 * multi-tenant architecture. Each tool resolves the calling user's Mapp
 * credentials from the credential store using the OAuth `sub` claim.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  apiGet,
  apiPost,
  apiDelete,
  apiGetAbsolute,
  pollForResult,
  type MappCredentials,
} from "./mapp-api";
import { loadCredentials } from "./credential-store";

/**
 * Resolve credentials for the current user from the auth context.
 * The `extra.sub` field is set by our verifyToken callback.
 */
async function getCredsFromContext(
  extra: Record<string, unknown> | undefined
): Promise<MappCredentials> {
  const sub = extra?.sub as string | undefined;
  if (!sub) {
    throw new Error(
      "Authentication required. Please connect via OAuth first."
    );
  }

  const creds = await loadCredentials(sub);
  if (!creds) {
    throw new Error(
      "Mapp Intelligence credentials not configured. Please save your Mapp client_id and client_secret via the settings endpoint first."
    );
  }

  return creds;
}

/**
 * Register all Mapp Intelligence tools on the given MCP server instance.
 */
export function registerTools(server: McpServer): void {
  // ---- Tool: list_dimensions_and_metrics ----------------------------------

  server.tool(
    "list_dimensions_and_metrics",
    `List all available dimensions and metrics in Mapp Intelligence.
Returns the complete catalog of dimensions (e.g. time_days, browser, device_class)
and metrics (e.g. qty_visits, pages_pageImpressions, order_value) that can be used
in analysis queries. Each entry includes the API name, data type, human-readable
title, context (VISITOR, SESSION, PAGE, ACTION, NONE), and whether it is sortable.
Use these names when constructing analysis queries.`,
    {
      language: z
        .string()
        .optional()
        .describe(
          "ISO-639-1 language code for titles (e.g. 'en', 'de'). Default: 'en'."
        ),
    },
    async ({ language }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(creds, "/analytics/api/query-objects", {
        language: language || "en",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: list_segments ------------------------------------------------

  server.tool(
    "list_segments",
    `List all available segments defined in Mapp Intelligence.
Returns an array of segments, each with an id, title, and description.
Segment IDs can be used in analysis queries as predefinedSegmentConnections
to filter data by visitor segments.`,
    {},
    async (_params, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(creds, "/analytics/api/segments");
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: list_dynamic_timefilters -------------------------------------

  server.tool(
    "list_dynamic_timefilters",
    `List all available dynamic time filters in Mapp Intelligence.
Returns predefined time ranges (e.g. "today", "last_7_days", "last_month",
"previous_year") with their internal filter configuration. Use these values
in the predefinedContainer.filters array of analysis queries to set the
time range.`,
    {
      language: z
        .string()
        .optional()
        .describe("ISO-639-1 language code for titles. Default: 'en'."),
    },
    async ({ language }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(creds, "/analytics/api/dynamic-timefilters", {
        language: language || "en",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: get_analysis_usage -------------------------------------------

  server.tool(
    "get_analysis_usage",
    `Show current monthly API usage quota for Mapp Intelligence.
Returns the number of calculations used so far this month,
the maximum allowed, and the current month/year.`,
    {},
    async (_params, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(
        creds,
        "/analytics/api/analysis-usage/current"
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: run_analysis -------------------------------------------------

  server.tool(
    "run_analysis",
    `Execute an analysis query against Mapp Intelligence and return the results.

This is the primary tool for retrieving analytics data. It submits a query,
polls for completion, and returns the full result including headers and rows.

The queryObject should be structured as follows:
- columns: Array of dimension/metric objects. Each needs at minimum a "name"
  field matching a value from list_dimensions_and_metrics.
- variant: One of "LIST", "PIVOT", "PIVOT_AS_LIST", or "COMPARISON".
- predefinedContainer: Object with "filters" and "containers" arrays.

Example queryObject:
{
  "columns": [
    {"name": "session_id", "scope": "OBJECT", "context": "SESSION", "variant": "NORMAL", "lowerLimit": 1, "upperLimit": 50},
    {"name": "pages_pageImpressions", "columnPeriod": "ANALYSIS", "scope": "OBJECT", "context": "PAGE", "variant": "NORMAL"}
  ],
  "variant": "LIST",
  "predefinedContainer": {
    "filters": [
      {"name": "time_dynamic", "filterPredicate": "LIKE", "connector": "AND", "caseSensitive": false, "context": "NONE", "intern": false, "value1": "last_7_days", "value2": ""}
    ],
    "containers": []
  }
}`,
    {
      queryObject: z
        .record(z.any())
        .describe("The full query object defining columns, variant, filters, and time range."),
      resultType: z
        .string()
        .optional()
        .describe('Result type. Default: "DATA_ONLY".'),
    },
    async ({ queryObject, resultType }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const body = { resultType: resultType || "DATA_ONLY", queryObject };

      const createResp = await apiPost(
        creds,
        "/analytics/api/analysis-query",
        body
      );

      if (createResp.resultUrl) {
        const result = await apiGetAbsolute(creds, createResp.resultUrl);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (createResp.statusUrl) {
        const statusResp = await pollForResult(creds, createResp.statusUrl);
        const result = await apiGetAbsolute(creds, statusResp.resultUrl);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(createResp, null, 2) },
        ],
      };
    }
  );

  // ---- Tool: create_analysis_query (async) --------------------------------

  server.tool(
    "create_analysis_query",
    `Submit an analysis query to Mapp Intelligence WITHOUT waiting for results.
Returns a correlationId and statusUrl for manual polling.`,
    {
      queryObject: z
        .record(z.any())
        .describe("The full query object (same structure as run_analysis)."),
      resultType: z
        .string()
        .optional()
        .describe('Result type. Default: "DATA_ONLY".'),
    },
    async ({ queryObject, resultType }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const body = { resultType: resultType || "DATA_ONLY", queryObject };
      const data = await apiPost(
        creds,
        "/analytics/api/analysis-query",
        body
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: check_analysis_status ----------------------------------------

  server.tool(
    "check_analysis_status",
    `Check the status of a previously submitted analysis query.`,
    {
      correlationId: z
        .string()
        .describe("The correlationId returned by create_analysis_query."),
    },
    async ({ correlationId }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(
        creds,
        `/analytics/api/analysis-query/${encodeURIComponent(correlationId)}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: get_analysis_result ------------------------------------------

  server.tool(
    "get_analysis_result",
    `Fetch the result data of a completed analysis query.`,
    {
      calculationId: z
        .string()
        .describe("The calculationId from the status response."),
    },
    async ({ calculationId }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(
        creds,
        `/analytics/api/analysis-result/${encodeURIComponent(calculationId)}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: cancel_analysis_query ----------------------------------------

  server.tool(
    "cancel_analysis_query",
    `Cancel a running analysis query.`,
    {
      correlationId: z
        .string()
        .describe("The correlationId of the query to cancel."),
    },
    async ({ correlationId }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiDelete(
        creds,
        `/analytics/api/analysis-query/${encodeURIComponent(correlationId)}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: run_report ---------------------------------------------------

  server.tool(
    "run_report",
    `Execute a report query that can contain multiple analysis elements.
Submits the report, polls for completion, and returns combined results.`,
    {
      id: z.number().optional().describe("Saved report ID from Mapp Intelligence."),
      elementIds: z
        .array(z.number())
        .optional()
        .describe("Specific element IDs within the report to calculate."),
      configuration: z
        .record(z.any())
        .optional()
        .describe("Full report configuration object."),
    },
    async ({ id, elementIds, configuration }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const body: Record<string, unknown> = {};
      if (id !== undefined) body.id = id;
      if (elementIds) body.elementIds = elementIds;
      if (configuration) body.configuration = configuration;

      const createResp = await apiPost(
        creds,
        "/analytics/api/report-query",
        body
      );
      const reportCorrelationId = createResp.reportCorrelationId;

      if (!reportCorrelationId) {
        return {
          content: [
            { type: "text", text: JSON.stringify(createResp, null, 2) },
          ],
        };
      }

      // Poll report status
      let reportStatus: Record<string, unknown> | undefined;
      for (let i = 0; i < 30; i++) {
        reportStatus = await apiGet(
          creds,
          `/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`
        );

        const states = reportStatus?.queryStates as
          | Array<{ status: string }>
          | undefined;
        const allDone =
          states &&
          states.every(
            (qs) =>
              qs.status === "SUCCESS" ||
              qs.status === "FAILED" ||
              qs.status === "ERROR"
          );

        if (allDone) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Fetch results for each successful element
      const states = reportStatus?.queryStates as
        | Array<{
            elementId: number;
            status: string;
            resultUrl?: string;
            error?: string;
          }>
        | undefined;

      if (states) {
        const results = [];
        for (const qs of states) {
          if (qs.status === "SUCCESS" && qs.resultUrl) {
            try {
              const result = await apiGetAbsolute(creds, qs.resultUrl);
              results.push({ elementId: qs.elementId, ...result });
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              results.push({ elementId: qs.elementId, error: msg });
            }
          } else {
            results.push({
              elementId: qs.elementId,
              status: qs.status,
              error: qs.error || null,
            });
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  reportCorrelationId,
                  reportStatus: (reportStatus as Record<string, unknown>)
                    ?.status,
                  elements: results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(reportStatus, null, 2) },
        ],
      };
    }
  );

  // ---- Tool: create_report_query (async) ----------------------------------

  server.tool(
    "create_report_query",
    `Submit a report query WITHOUT waiting for results.`,
    {
      id: z.number().optional().describe("Saved report ID."),
      elementIds: z
        .array(z.number())
        .optional()
        .describe("Specific element IDs."),
      configuration: z
        .record(z.any())
        .optional()
        .describe("Full report configuration."),
    },
    async ({ id, elementIds, configuration }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const body: Record<string, unknown> = {};
      if (id !== undefined) body.id = id;
      if (elementIds) body.elementIds = elementIds;
      if (configuration) body.configuration = configuration;

      const data = await apiPost(
        creds,
        "/analytics/api/report-query",
        body
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: check_report_status ------------------------------------------

  server.tool(
    "check_report_status",
    `Check the status of a previously submitted report query.`,
    {
      reportCorrelationId: z
        .string()
        .describe("The reportCorrelationId from create_report_query."),
    },
    async ({ reportCorrelationId }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiGet(
        creds,
        `/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ---- Tool: cancel_report_query ------------------------------------------

  server.tool(
    "cancel_report_query",
    `Cancel a running report query.`,
    {
      reportCorrelationId: z
        .string()
        .describe("The reportCorrelationId of the report to cancel."),
    },
    async ({ reportCorrelationId }, { authInfo }) => {
      const creds = await getCredsFromContext(authInfo?.extra);
      const data = await apiDelete(
        creds,
        `/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
