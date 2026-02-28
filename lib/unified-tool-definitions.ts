import { z } from "zod";
import {
  apiDelete,
  apiGet,
  apiGetAbsolute,
  apiPost,
  pollForResult,
  type MappCredentials,
} from "./mapp-api";
import { assertTrustedMappAbsoluteUrl } from "./mapp-base-url";
import { loadCredentials } from "./credential-store";

export type UnifiedToolCategory =
  | "discovery"
  | "usage"
  | "analysis"
  | "report";

export interface UnifiedToolExecutionContext {
  authInfo?: {
    extra?: Record<string, unknown>;
  };
}

export interface UnifiedToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  category: UnifiedToolCategory;
  execute: (
    args: Record<string, unknown>,
    context: UnifiedToolExecutionContext
  ) => Promise<unknown>;
}

async function getCredsFromContext(
  context: UnifiedToolExecutionContext
): Promise<MappCredentials> {
  const sub = context.authInfo?.extra?.sub as string | undefined;
  if (!sub) {
    throw new Error("Authentication required. Please connect via OAuth first.");
  }

  const creds = await loadCredentials(sub);
  if (!creds) {
    throw new Error(
      "Mapp Intelligence credentials not configured. Please save your Mapp client_id and client_secret via the settings endpoint first."
    );
  }

  return creds;
}

function parseOptionalString(
  value: unknown,
  fallback: string
): string {
  return typeof value === "string" ? value : fallback;
}

const TOOL_DEFINITIONS: UnifiedToolDefinition[] = [
  {
    name: "list_dimensions_and_metrics",
    title: "List Dimensions And Metrics",
    description: `List all available dimensions and metrics in Mapp Intelligence.
Returns the complete catalog of dimensions (e.g. time_days, browser, device_class)
and metrics (e.g. qty_visits, pages_pageImpressions, order_value) that can be used
in analysis queries. Each entry includes the API name, data type, human-readable
title, context (VISITOR, SESSION, PAGE, ACTION, NONE), and whether it is sortable.
Use these names when constructing analysis queries.`,
    inputSchema: {
      language: z
        .string()
        .optional()
        .describe(
          "ISO-639-1 language code for titles (e.g. 'en', 'de'). Default: 'en'."
        ),
    },
    category: "discovery",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const language = parseOptionalString(args.language, "en");
      return apiGet(creds, "/analytics/api/query-objects", {
        language,
      });
    },
  },
  {
    name: "list_segments",
    title: "List Segments",
    description: `List all available segments defined in Mapp Intelligence.
Returns an array of segments, each with an id, title, and description.
Segment IDs can be used in analysis queries as predefinedSegmentConnections
to filter data by visitor segments.`,
    inputSchema: {},
    category: "discovery",
    execute: async (_args, context) => {
      const creds = await getCredsFromContext(context);
      return apiGet(creds, "/analytics/api/segments");
    },
  },
  {
    name: "list_dynamic_timefilters",
    title: "List Dynamic Timefilters",
    description: `List all available dynamic time filters in Mapp Intelligence.
Returns predefined time ranges (e.g. "today", "last_7_days", "last_month",
"previous_year") with their internal filter configuration. Use these values
in the predefinedContainer.filters array of analysis queries to set the
time range.`,
    inputSchema: {
      language: z
        .string()
        .optional()
        .describe("ISO-639-1 language code for titles. Default: 'en'."),
    },
    category: "discovery",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const language = parseOptionalString(args.language, "en");
      return apiGet(creds, "/analytics/api/dynamic-timefilters", {
        language,
      });
    },
  },
  {
    name: "get_analysis_usage",
    title: "Get Analysis Usage",
    description: `Show current monthly API usage quota for Mapp Intelligence.
Returns the number of calculations used so far this month,
the maximum allowed, and the current month/year.`,
    inputSchema: {},
    category: "usage",
    execute: async (_args, context) => {
      const creds = await getCredsFromContext(context);
      return apiGet(creds, "/analytics/api/analysis-usage/current");
    },
  },
  {
    name: "run_analysis",
    title: "Run Analysis",
    description: `Execute an analysis query against Mapp Intelligence and return the results.

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
    inputSchema: {
      queryObject: z
        .record(z.any())
        .describe(
          "The full query object defining columns, variant, filters, and time range."
        ),
      resultType: z
        .string()
        .optional()
        .describe('Result type. Default: "DATA_ONLY".'),
    },
    category: "analysis",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const queryObject = args.queryObject as Record<string, unknown>;
      const resultType = parseOptionalString(args.resultType, "DATA_ONLY");
      const body = { resultType, queryObject };

      const createResp = (await apiPost(
        creds,
        "/analytics/api/analysis-query",
        body
      )) as Record<string, unknown>;

      if (typeof createResp.resultUrl === "string") {
        assertTrustedMappAbsoluteUrl(createResp.resultUrl);
        return apiGetAbsolute(creds, createResp.resultUrl);
      }

      if (typeof createResp.statusUrl === "string") {
        assertTrustedMappAbsoluteUrl(createResp.statusUrl);
        const statusResp = (await pollForResult(
          creds,
          createResp.statusUrl
        )) as Record<string, unknown>;
        if (typeof statusResp.resultUrl !== "string") {
          throw new Error("Analysis status response is missing resultUrl");
        }
        assertTrustedMappAbsoluteUrl(statusResp.resultUrl);
        return apiGetAbsolute(creds, statusResp.resultUrl);
      }

      return createResp;
    },
  },
  {
    name: "create_analysis_query",
    title: "Create Analysis Query",
    description: `Submit an analysis query to Mapp Intelligence WITHOUT waiting for results.
Returns a correlationId and statusUrl for manual polling.`,
    inputSchema: {
      queryObject: z
        .record(z.any())
        .describe("The full query object (same structure as run_analysis)."),
      resultType: z
        .string()
        .optional()
        .describe('Result type. Default: "DATA_ONLY".'),
    },
    category: "analysis",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const queryObject = args.queryObject as Record<string, unknown>;
      const resultType = parseOptionalString(args.resultType, "DATA_ONLY");
      const body = { resultType, queryObject };
      return apiPost(creds, "/analytics/api/analysis-query", body);
    },
  },
  {
    name: "check_analysis_status",
    title: "Check Analysis Status",
    description: "Check the status of a previously submitted analysis query.",
    inputSchema: {
      correlationId: z
        .string()
        .describe("The correlationId returned by create_analysis_query."),
    },
    category: "analysis",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const correlationId = String(args.correlationId);
      return apiGet(
        creds,
        `/analytics/api/analysis-query/${encodeURIComponent(correlationId)}`
      );
    },
  },
  {
    name: "get_analysis_result",
    title: "Get Analysis Result",
    description: "Fetch the result data of a completed analysis query.",
    inputSchema: {
      calculationId: z
        .string()
        .describe("The calculationId from the status response."),
    },
    category: "analysis",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const calculationId = String(args.calculationId);
      return apiGet(
        creds,
        `/analytics/api/analysis-result/${encodeURIComponent(calculationId)}`
      );
    },
  },
  {
    name: "cancel_analysis_query",
    title: "Cancel Analysis Query",
    description: "Cancel a running analysis query.",
    inputSchema: {
      correlationId: z
        .string()
        .describe("The correlationId of the query to cancel."),
    },
    category: "analysis",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const correlationId = String(args.correlationId);
      return apiDelete(
        creds,
        `/analytics/api/analysis-query/${encodeURIComponent(correlationId)}`
      );
    },
  },
  {
    name: "run_report",
    title: "Run Report",
    description: `Execute a report query that can contain multiple analysis elements.
Submits the report, polls for completion, and returns combined results.`,
    inputSchema: {
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
    category: "report",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const body: Record<string, unknown> = {};
      if (typeof args.id === "number") body.id = args.id;
      if (Array.isArray(args.elementIds)) body.elementIds = args.elementIds;
      if (args.configuration && typeof args.configuration === "object") {
        body.configuration = args.configuration;
      }

      const createResp = (await apiPost(
        creds,
        "/analytics/api/report-query",
        body
      )) as Record<string, unknown>;
      const reportCorrelationId = createResp.reportCorrelationId;

      if (!reportCorrelationId) {
        return createResp;
      }

      let reportStatus: Record<string, unknown> | undefined;
      for (let i = 0; i < 30; i++) {
        reportStatus = (await apiGet(
          creds,
          `/analytics/api/report-query/${encodeURIComponent(String(reportCorrelationId))}`
        )) as Record<string, unknown>;

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
              assertTrustedMappAbsoluteUrl(qs.resultUrl);
              const result = await apiGetAbsolute(creds, qs.resultUrl);
              results.push({ elementId: qs.elementId, ...result });
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : String(error);
              results.push({ elementId: qs.elementId, error: message });
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
          reportCorrelationId,
          reportStatus: (reportStatus as Record<string, unknown>)?.status,
          elements: results,
        };
      }

      return reportStatus;
    },
  },
  {
    name: "create_report_query",
    title: "Create Report Query",
    description: "Submit a report query WITHOUT waiting for results.",
    inputSchema: {
      id: z.number().optional().describe("Saved report ID."),
      elementIds: z.array(z.number()).optional().describe("Specific element IDs."),
      configuration: z
        .record(z.any())
        .optional()
        .describe("Full report configuration."),
    },
    category: "report",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const body: Record<string, unknown> = {};
      if (typeof args.id === "number") body.id = args.id;
      if (Array.isArray(args.elementIds)) body.elementIds = args.elementIds;
      if (args.configuration && typeof args.configuration === "object") {
        body.configuration = args.configuration;
      }

      return apiPost(creds, "/analytics/api/report-query", body);
    },
  },
  {
    name: "check_report_status",
    title: "Check Report Status",
    description: "Check the status of a previously submitted report query.",
    inputSchema: {
      reportCorrelationId: z
        .string()
        .describe("The reportCorrelationId from create_report_query."),
    },
    category: "report",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const reportCorrelationId = String(args.reportCorrelationId);
      return apiGet(
        creds,
        `/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`
      );
    },
  },
  {
    name: "cancel_report_query",
    title: "Cancel Report Query",
    description: "Cancel a running report query.",
    inputSchema: {
      reportCorrelationId: z
        .string()
        .describe("The reportCorrelationId of the report to cancel."),
    },
    category: "report",
    execute: async (args, context) => {
      const creds = await getCredsFromContext(context);
      const reportCorrelationId = String(args.reportCorrelationId);
      return apiDelete(
        creds,
        `/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`
      );
    },
  },
];

export function getUnifiedToolDefinitions(): UnifiedToolDefinition[] {
  return TOOL_DEFINITIONS;
}
