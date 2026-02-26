# MCP Tools Reference

This document describes all 13 MCP tools registered by the Mapp Intelligence MCP Remote Server. Tools are served via `POST /api/mcp` using the MCP Streamable HTTP transport.

All tools require a valid Auth0 Bearer token and configured Mapp credentials. If either is missing, the tool returns an error message as MCP text content.

---

## Table of Contents

1. [Common Patterns](#common-patterns)
2. [Discovery Tools](#discovery-tools)
   - [list_dimensions_and_metrics](#list_dimensions_and_metrics)
   - [list_segments](#list_segments)
   - [list_dynamic_timefilters](#list_dynamic_timefilters)
3. [Usage Tools](#usage-tools)
   - [get_analysis_usage](#get_analysis_usage)
4. [Analysis Tools](#analysis-tools)
   - [run_analysis](#run_analysis)
   - [create_analysis_query](#create_analysis_query)
   - [check_analysis_status](#check_analysis_status)
   - [get_analysis_result](#get_analysis_result)
   - [cancel_analysis_query](#cancel_analysis_query)
5. [Report Tools](#report-tools)
   - [run_report](#run_report)
   - [create_report_query](#create_report_query)
   - [check_report_status](#check_report_status)
   - [cancel_report_query](#cancel_report_query)
6. [Analysis vs Report: When to Use Which](#analysis-vs-report-when-to-use-which)
7. [Sync vs Async Tool Pairs](#sync-vs-async-tool-pairs)

---

## Common Patterns

### Credential Resolution

Every tool begins by resolving the calling user's Mapp credentials from Redis:

```
authInfo.extra.sub → loadCredentials(sub) → { clientId, clientSecret, baseUrl }
```

If `sub` is absent (unauthenticated request) or no credentials are stored for the user, the tool returns an error.

### Return Format

All tools return JSON-stringified results as a single MCP text content item:

```json
{
  "content": [
    { "type": "text", "text": "{ ... JSON ... }" }
  ]
}
```

### Error Handling

On Mapp API errors, the HTTP helper throws with a message including the HTTP status and response body. This surfaces to the MCP client as an error response.

---

## Discovery Tools

These tools retrieve metadata about the Mapp Intelligence account — available dimensions, metrics, segments, and time filters. Use them before constructing analysis queries.

---

### `list_dimensions_and_metrics`

**Description:**
> List all available dimensions and metrics in Mapp Intelligence.
> Returns the complete catalog of dimensions (e.g. `time_days`, `browser`, `device_class`)
> and metrics (e.g. `qty_visits`, `pages_pageImpressions`, `order_value`) that can be used
> in analysis queries. Each entry includes the API name, data type, human-readable
> title, context (`VISITOR`, `SESSION`, `PAGE`, `ACTION`, `NONE`), and whether it is sortable.
> Use these names when constructing analysis queries.

**Mapp API Endpoint:** `GET /analytics/api/query-objects`

#### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `language` | string | No | `"en"` | ISO-639-1 language code for human-readable titles (e.g. `"en"`, `"de"`) |

#### Example Call

```json
{
  "tool": "list_dimensions_and_metrics",
  "arguments": {
    "language": "en"
  }
}
```

#### Example Response (abbreviated)

```json
[
  {
    "name": "time_days",
    "dataType": "DATE",
    "title": "Day",
    "context": "NONE",
    "sortable": true
  },
  {
    "name": "qty_visits",
    "dataType": "NUMBER",
    "title": "Visits",
    "context": "SESSION",
    "sortable": true
  },
  {
    "name": "pages_pageImpressions",
    "dataType": "NUMBER",
    "title": "Page Impressions",
    "context": "PAGE",
    "sortable": true
  }
]
```

---

### `list_segments`

**Description:**
> List all available segments defined in Mapp Intelligence.
> Returns an array of segments, each with an `id`, `title`, and `description`.
> Segment IDs can be used in analysis queries as `predefinedSegmentConnections`
> to filter data by visitor segments.

**Mapp API Endpoint:** `GET /analytics/api/segments`

#### Parameters

None.

#### Example Call

```json
{
  "tool": "list_segments",
  "arguments": {}
}
```

#### Example Response (abbreviated)

```json
[
  {
    "id": "seg_001",
    "title": "Mobile Users",
    "description": "Visitors who accessed the site on a mobile device"
  },
  {
    "id": "seg_002",
    "title": "New Visitors",
    "description": "Visitors who visited for the first time"
  }
]
```

---

### `list_dynamic_timefilters`

**Description:**
> List all available dynamic time filters in Mapp Intelligence.
> Returns predefined time ranges (e.g. `"today"`, `"last_7_days"`, `"last_month"`,
> `"previous_year"`) with their internal filter configuration. Use these values
> in the `predefinedContainer.filters` array of analysis queries to set the
> time range.

**Mapp API Endpoint:** `GET /analytics/api/dynamic-timefilters`

#### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `language` | string | No | `"en"` | ISO-639-1 language code for titles |

#### Example Call

```json
{
  "tool": "list_dynamic_timefilters",
  "arguments": {
    "language": "en"
  }
}
```

#### Example Response (abbreviated)

```json
[
  {
    "value1": "today",
    "title": "Today"
  },
  {
    "value1": "last_7_days",
    "title": "Last 7 Days"
  },
  {
    "value1": "last_month",
    "title": "Last Month"
  },
  {
    "value1": "previous_year",
    "title": "Previous Year"
  }
]
```

The `value1` field is what you pass into the `predefinedContainer.filters` array of analysis queries.

---

## Usage Tools

---

### `get_analysis_usage`

**Description:**
> Show current monthly API usage quota for Mapp Intelligence.
> Returns the number of calculations used so far this month,
> the maximum allowed, and the current month/year.

**Mapp API Endpoint:** `GET /analytics/api/analysis-usage/current`

#### Parameters

None.

#### Example Call

```json
{
  "tool": "get_analysis_usage",
  "arguments": {}
}
```

#### Example Response

```json
{
  "used": 142,
  "maximum": 1000,
  "month": 2,
  "year": 2026
}
```

---

## Analysis Tools

Analysis tools operate on the Mapp Intelligence analysis query API. An **analysis query** runs a single tabular query with specified columns (dimensions and metrics), variant (LIST, PIVOT, etc.), and filters (time range, segments).

Two usage patterns are available:
- **Synchronous** (`run_analysis`): submit and wait for results in a single tool call
- **Asynchronous** (`create_analysis_query` → `check_analysis_status` → `get_analysis_result`): submit first, poll separately

---

### `run_analysis`

**Description:**
> Execute an analysis query against Mapp Intelligence and return the results.
>
> This is the primary tool for retrieving analytics data. It submits a query,
> polls for completion, and returns the full result including headers and rows.
>
> The `queryObject` should be structured as follows:
> - `columns`: Array of dimension/metric objects. Each needs at minimum a `"name"`
>   field matching a value from `list_dimensions_and_metrics`.
> - `variant`: One of `"LIST"`, `"PIVOT"`, `"PIVOT_AS_LIST"`, or `"COMPARISON"`.
> - `predefinedContainer`: Object with `"filters"` and `"containers"` arrays.

**Mapp API Endpoint:** `POST /analytics/api/analysis-query` + polling via `statusUrl` / `resultUrl`

#### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `queryObject` | object | Yes | — | The full query object defining columns, variant, filters, and time range |
| `resultType` | string | No | `"DATA_ONLY"` | Result type format. `"DATA_ONLY"` returns rows and headers. |

#### `queryObject` Structure

```typescript
{
  columns: Array<{
    name: string;           // Required: dimension/metric name from list_dimensions_and_metrics
    scope?: string;         // e.g. "OBJECT"
    context?: string;       // e.g. "SESSION", "PAGE", "VISITOR"
    variant?: string;       // e.g. "NORMAL"
    columnPeriod?: string;  // e.g. "ANALYSIS"
    lowerLimit?: number;    // Pagination lower bound (1-based)
    upperLimit?: number;    // Pagination upper bound
  }>;
  variant: "LIST" | "PIVOT" | "PIVOT_AS_LIST" | "COMPARISON";
  predefinedContainer: {
    filters: Array<{
      name: string;           // e.g. "time_dynamic"
      filterPredicate: string; // e.g. "LIKE"
      connector: string;       // e.g. "AND"
      caseSensitive: boolean;
      context: string;         // e.g. "NONE"
      intern: boolean;
      value1: string;          // e.g. "last_7_days"
      value2: string;
    }>;
    containers: Array<unknown>;
  };
}
```

#### Example Call

```json
{
  "tool": "run_analysis",
  "arguments": {
    "queryObject": {
      "columns": [
        {
          "name": "session_id",
          "scope": "OBJECT",
          "context": "SESSION",
          "variant": "NORMAL",
          "lowerLimit": 1,
          "upperLimit": 50
        },
        {
          "name": "pages_pageImpressions",
          "columnPeriod": "ANALYSIS",
          "scope": "OBJECT",
          "context": "PAGE",
          "variant": "NORMAL"
        }
      ],
      "variant": "LIST",
      "predefinedContainer": {
        "filters": [
          {
            "name": "time_dynamic",
            "filterPredicate": "LIKE",
            "connector": "AND",
            "caseSensitive": false,
            "context": "NONE",
            "intern": false,
            "value1": "last_7_days",
            "value2": ""
          }
        ],
        "containers": []
      }
    },
    "resultType": "DATA_ONLY"
  }
}
```

#### Execution Flow

```
1. POST /analytics/api/analysis-query → { resultUrl?, statusUrl?, correlationId }
2. If resultUrl is present immediately → GET resultUrl → return result
3. If statusUrl is present → pollForResult(statusUrl)
     poll up to 30 times, 2s interval
     wait for resultUrl to appear in status response
4. GET resultUrl → return result
```

#### Example Response (abbreviated)

```json
{
  "headers": ["Session ID", "Page Impressions"],
  "rows": [
    ["sess_abc123", 12],
    ["sess_def456", 7]
  ],
  "totalRows": 2
}
```

---

### `create_analysis_query`

**Description:**
> Submit an analysis query to Mapp Intelligence WITHOUT waiting for results.
> Returns a `correlationId` and `statusUrl` for manual polling.

**Mapp API Endpoint:** `POST /analytics/api/analysis-query`

Use this tool when you want to submit a query and check the result later (e.g. for very long-running queries, or when submitting multiple queries in parallel). Follow up with `check_analysis_status` and `get_analysis_result`.

#### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `queryObject` | object | Yes | — | The full query object (same structure as `run_analysis`) |
| `resultType` | string | No | `"DATA_ONLY"` | Result type format |

#### Example Call

```json
{
  "tool": "create_analysis_query",
  "arguments": {
    "queryObject": { "...": "..." },
    "resultType": "DATA_ONLY"
  }
}
```

#### Example Response

```json
{
  "correlationId": "corr_abc123def456",
  "statusUrl": "https://intelligence.eu.mapp.com/analytics/api/analysis-query/corr_abc123def456",
  "status": "PENDING"
}
```

Save `correlationId` for use with `check_analysis_status` and `cancel_analysis_query`.

---

### `check_analysis_status`

**Description:**
> Check the status of a previously submitted analysis query.

**Mapp API Endpoint:** `GET /analytics/api/analysis-query/{correlationId}`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `correlationId` | string | Yes | The `correlationId` returned by `create_analysis_query` |

#### Example Call

```json
{
  "tool": "check_analysis_status",
  "arguments": {
    "correlationId": "corr_abc123def456"
  }
}
```

#### Example Responses

**Pending:**

```json
{
  "correlationId": "corr_abc123def456",
  "status": "PENDING"
}
```

**Complete:**

```json
{
  "correlationId": "corr_abc123def456",
  "status": "SUCCESS",
  "calculationId": "calc_xyz789",
  "resultUrl": "https://intelligence.eu.mapp.com/analytics/api/analysis-result/calc_xyz789"
}
```

When `status` is `"SUCCESS"`, use `calculationId` with `get_analysis_result`.

---

### `get_analysis_result`

**Description:**
> Fetch the result data of a completed analysis query.

**Mapp API Endpoint:** `GET /analytics/api/analysis-result/{calculationId}`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `calculationId` | string | Yes | The `calculationId` from the status response |

#### Example Call

```json
{
  "tool": "get_analysis_result",
  "arguments": {
    "calculationId": "calc_xyz789"
  }
}
```

#### Example Response

```json
{
  "headers": ["Browser", "Visits"],
  "rows": [
    ["Chrome", 15234],
    ["Safari", 8901],
    ["Firefox", 2345]
  ],
  "totalRows": 3
}
```

---

### `cancel_analysis_query`

**Description:**
> Cancel a running analysis query.

**Mapp API Endpoint:** `DELETE /analytics/api/analysis-query/{correlationId}`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `correlationId` | string | Yes | The `correlationId` of the query to cancel |

#### Example Call

```json
{
  "tool": "cancel_analysis_query",
  "arguments": {
    "correlationId": "corr_abc123def456"
  }
}
```

#### Example Response

```json
{
  "success": true,
  "status": 204
}
```

---

## Report Tools

Report tools operate on the Mapp Intelligence report query API. A **report** contains multiple analysis elements and can be calculated together. Reports are identified by a saved report ID in the Mapp Intelligence platform.

The async pattern is identical to the analysis tools, but uses `reportCorrelationId` rather than `correlationId`.

---

### `run_report`

**Description:**
> Execute a report query that can contain multiple analysis elements.
> Submits the report, polls for completion, and returns combined results.

**Mapp API Endpoint:** `POST /analytics/api/report-query` + polling

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | No | Saved report ID from Mapp Intelligence |
| `elementIds` | number[] | No | Specific element IDs within the report to calculate |
| `configuration` | object | No | Full report configuration object |

At least one of `id` or `configuration` should typically be provided.

#### Example Call

```json
{
  "tool": "run_report",
  "arguments": {
    "id": 12345,
    "elementIds": [1, 2, 3]
  }
}
```

#### Execution Flow

```
1. POST /analytics/api/report-query → { reportCorrelationId }
2. Poll GET /analytics/api/report-query/{reportCorrelationId}
     up to 30 times, 2s interval
     wait until all queryStates have status SUCCESS, FAILED, or ERROR
3. For each SUCCESS queryState:
     GET queryState.resultUrl → fetch result
4. Return combined results for all elements
```

#### Example Response

```json
{
  "reportCorrelationId": "report_corr_abc123",
  "reportStatus": "SUCCESS",
  "elements": [
    {
      "elementId": 1,
      "headers": ["Day", "Visits"],
      "rows": [
        ["2026-02-25", 1234],
        ["2026-02-26", 1567]
      ]
    },
    {
      "elementId": 2,
      "headers": ["Browser", "Page Impressions"],
      "rows": [
        ["Chrome", 5432]
      ]
    }
  ]
}
```

If an element failed, it appears as:

```json
{
  "elementId": 3,
  "status": "FAILED",
  "error": "Query timeout"
}
```

---

### `create_report_query`

**Description:**
> Submit a report query WITHOUT waiting for results.

**Mapp API Endpoint:** `POST /analytics/api/report-query`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | No | Saved report ID |
| `elementIds` | number[] | No | Specific element IDs to calculate |
| `configuration` | object | No | Full report configuration |

#### Example Call

```json
{
  "tool": "create_report_query",
  "arguments": {
    "id": 12345
  }
}
```

#### Example Response

```json
{
  "reportCorrelationId": "report_corr_abc123",
  "status": "PENDING"
}
```

Save `reportCorrelationId` for use with `check_report_status` and `cancel_report_query`.

---

### `check_report_status`

**Description:**
> Check the status of a previously submitted report query.

**Mapp API Endpoint:** `GET /analytics/api/report-query/{reportCorrelationId}`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `reportCorrelationId` | string | Yes | The `reportCorrelationId` from `create_report_query` |

#### Example Call

```json
{
  "tool": "check_report_status",
  "arguments": {
    "reportCorrelationId": "report_corr_abc123"
  }
}
```

#### Example Response

```json
{
  "reportCorrelationId": "report_corr_abc123",
  "status": "SUCCESS",
  "queryStates": [
    {
      "elementId": 1,
      "status": "SUCCESS",
      "resultUrl": "https://intelligence.eu.mapp.com/analytics/api/analysis-result/calc_elem1"
    },
    {
      "elementId": 2,
      "status": "PENDING"
    }
  ]
}
```

When all `queryStates` have `status` of `SUCCESS`, `FAILED`, or `ERROR`, the report is complete. Use `resultUrl` from each successful element to fetch results.

---

### `cancel_report_query`

**Description:**
> Cancel a running report query.

**Mapp API Endpoint:** `DELETE /analytics/api/report-query/{reportCorrelationId}`

#### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `reportCorrelationId` | string | Yes | The `reportCorrelationId` of the report to cancel |

#### Example Call

```json
{
  "tool": "cancel_report_query",
  "arguments": {
    "reportCorrelationId": "report_corr_abc123"
  }
}
```

#### Example Response

```json
{
  "success": true,
  "status": 204
}
```

---

## Analysis vs Report: When to Use Which

| Scenario | Use |
|---|---|
| Single tabular query (one set of dimensions + metrics) | `run_analysis` |
| Multiple related queries combined into one call | `run_report` |
| Query against a pre-configured saved report in Mapp | `run_report` with `id` |
| Custom ad-hoc query constructed at runtime | `run_analysis` |

---

## Sync vs Async Tool Pairs

Each primary operation has a synchronous convenience tool and an async variant:

| Operation | Sync (wait for result) | Async (manual polling) |
|---|---|---|
| Analysis query | `run_analysis` | `create_analysis_query` → `check_analysis_status` → `get_analysis_result` |
| Report query | `run_report` | `create_report_query` → `check_report_status` → (fetch resultUrl manually) |

**Use the sync tools** (`run_analysis`, `run_report`) unless:
- The query is expected to take longer than 60 seconds (polling budget: 30 × 2s = 60s)
- You need to submit multiple queries concurrently and check them later
- You want to cancel a query mid-flight

**Use the async tools** when you need explicit control over the polling lifecycle or when dealing with very large datasets that consistently time out the sync tools.
