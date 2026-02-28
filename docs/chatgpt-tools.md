# ChatGPT MCP Tool Contracts

This document describes the ChatGPT-focused MCP endpoint:

- `GET|POST|DELETE /api/mcp-chatgpt`

The endpoint now shares the same core 13-tool contract as `/api/mcp` and adds a ChatGPT-specific presentation layer (`structuredContent` + widget metadata).

## Tool Inventory (Same as `/api/mcp`)

### Discovery
- `list_dimensions_and_metrics`
- `list_segments`
- `list_dynamic_timefilters`

### Usage
- `get_analysis_usage`

### Analysis
- `run_analysis`
- `create_analysis_query`
- `check_analysis_status`
- `get_analysis_result`
- `cancel_analysis_query`

### Reports
- `run_report`
- `create_report_query`
- `check_report_status`
- `cancel_report_query`

Legacy guided ChatGPT tools were removed from active registration.

## Shared Input/Execution Behavior

Input schemas, downstream Mapp API behavior, and auth/credential requirements are aligned with the generic endpoint implementation in `lib/unified-tool-definitions.ts`.

## ChatGPT Response Contract

Each tool response includes:

- `content`: full JSON payload text (non-lossy)
- `structuredContent` envelope:
  - `tool`
  - `category` (`discovery | usage | analysis | report`)
  - `data` (raw tool result object)
  - `summary` (`kind`, `keys`, `rowCount`, `warnings`)
- `_meta` with widget/output template hints

## Widget Resources

Two MCP resources are registered for ChatGPT rendering:

- `ui://widget/analytics.html`
- `ui://widget/kpi.html`

Category mapping:

- `usage` -> KPI widget
- all other categories -> analytics widget

## Error Codes

ChatGPT tool failures are surfaced with prefixed codes (for example `[E_MAPP_API] ...`) and logged with `[tool-outcome]` entries.

Common codes:

- `E_AUTH_REQUIRED`
- `E_CREDENTIALS_MISSING`
- `E_MAPP_AUTH`
- `E_MAPP_API`
- `E_INTERNAL`

Non-fatal warning code:

- `WARN_QUOTA_ZERO` (quota maximum is `0`)
