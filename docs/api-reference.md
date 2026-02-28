# API Endpoint Reference

This document describes every HTTP endpoint exposed by the Mapp Intelligence MCP Remote Server.

---

## Table of Contents

1. [Authentication Schemes](#authentication-schemes)
2. [Endpoints](#endpoints)
   - [POST/GET/DELETE `/api/mcp`](#postgetdelete-apimcp) — MCP Streamable HTTP
   - [POST/GET/DELETE `/api/mcp-chatgpt`](#postgetdelete-apimcp-chatgpt) — ChatGPT-focused MCP endpoint
   - [POST/GET/DELETE `/api/mcp-chatgpt/mcp`](#postgetdelete-apimcp-chatgptmcp) — Compatibility endpoint
   - [GET `/api/settings`](#get-apisettings) — Credential status
   - [POST `/api/settings`](#post-apisettings) — Save credentials
   - [DELETE `/api/settings`](#delete-apisettings) — Remove credentials
   - [POST `/api/setup`](#post-apisetup) — Onboarding credential save
   - [GET `/api/auth/login`](#get-apiauthlogin) — OAuth login init (`state` + PKCE)
   - [GET `/api/auth/callback`](#get-apiauthcallback) — OAuth code callback
   - [GET `/api/health`](#get-apihealth) — Health check
   - [GET `/.well-known/oauth-protected-resource`](#get-well-knownoauth-protected-resource) — OAuth metadata
3. [Error Responses](#error-responses)

---

## Authentication Schemes

### Bearer Token (Auth0 JWT)

Most endpoints require an `Authorization: Bearer <token>` header where the token is an Auth0 RS256 JWT.

- Issued by Auth0 after successful OAuth 2.0 authorization code flow
- Audience: `https://mapp-intelligence-mcp.vercel.app/api/mcp`
- Issuer: `https://mapp-product.eu.auth0.com/`
- Algorithm: RS256
- Verified against Auth0 JWKS at `https://mapp-product.eu.auth0.com/.well-known/jwks.json`

### Session Token (Auth0 Action HS256)

Used exclusively by `POST /api/setup`. Issued by the Auth0 Post-Login Action during the onboarding redirect flow.

- Algorithm: HS256
- Signed by `AUTH0_ACTION_SECRET` (server) / `SESSION_TOKEN_SECRET` (Auth0 Action)
- Short-lived (1 hour)
- Carries `sub` (user identity) and `email`

---

## Endpoints

---

### POST/GET/DELETE `/api/mcp`

**File:** `app/api/mcp/route.ts`

The main MCP server endpoint. All MCP protocol operations (tool listing, tool calls, resource enumeration) pass through this endpoint using the Streamable HTTP transport.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

Returns `401 Unauthorized` with `WWW-Authenticate: Bearer` if the token is missing or invalid.

#### Request

The request format is defined by the MCP Streamable HTTP protocol. MCP clients handle this automatically — you do not construct these requests manually.

- **Method:** `POST` (for tool calls and protocol messages), `GET` and `DELETE` (used by the MCP transport for specific protocol operations)
- **Content-Type:** `application/json`
- **Max duration:** 120 seconds (configured via `maxDuration: 120` in `createMcpHandler`)

#### Response

MCP protocol responses (JSON-RPC 2.0 format). Tool results are returned as:

```json
{
  "content": [
    {
      "type": "text",
      "text": "<JSON-stringified result>"
    }
  ]
}
```

#### Notes

- All 13 Mapp Intelligence tools are served from this endpoint. See [mcp-tools.md](./mcp-tools.md) for tool documentation.
- The `sub` claim from the bearer token is forwarded to each tool handler as `authInfo.extra.sub`, used to key per-user credential lookup in Redis.
- Verbose protocol logging is enabled only when `NODE_ENV !== "production"`.

---

### POST/GET/DELETE `/api/mcp-chatgpt`

**File:** `app/api/mcp-chatgpt/route.ts`

ChatGPT-focused MCP endpoint that exposes the same core 13-tool contract as `/api/mcp`, with additional structured outputs and widget metadata.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

Returns `401 Unauthorized` with `WWW-Authenticate: Bearer` if the token is missing or invalid.

#### Request

Same Streamable HTTP transport as `/api/mcp`.

- **Method:** `POST`, `GET`, `DELETE`
- **Content-Type:** `application/json`
- **Max duration:** 120 seconds

#### Notes

- Intended for ChatGPT connectors and in-chat visualization workflows.
- Uses explicit `outputSchema` + `structuredContent` envelope contracts.
- Tool inventory is aligned with `/api/mcp`:
  - Discovery: `list_dimensions_and_metrics`, `list_segments`, `list_dynamic_timefilters`
  - Usage: `get_analysis_usage`
  - Analysis: `run_analysis`, `create_analysis_query`, `check_analysis_status`, `get_analysis_result`, `cancel_analysis_query`
  - Reports: `run_report`, `create_report_query`, `check_report_status`, `cancel_report_query`
- Registers UI resources:
  - `ui://widget/analytics.html`
  - `ui://widget/kpi.html`

#### Tool Inventory

The ChatGPT endpoint exposes the same 13 tools as the generic endpoint:

- Discovery: `list_dimensions_and_metrics`, `list_segments`, `list_dynamic_timefilters`
- Usage: `get_analysis_usage`
- Analysis: `run_analysis`, `create_analysis_query`, `check_analysis_status`, `get_analysis_result`, `cancel_analysis_query`
- Reports: `run_report`, `create_report_query`, `check_report_status`, `cancel_report_query`

Legacy guided ChatGPT-specific tools are not part of active registration.

#### Shared Input and Execution Behavior

Input schemas, downstream Mapp API behavior, and auth/credential requirements are aligned with the generic endpoint implementation in `lib/unified-tool-definitions.ts`.

#### ChatGPT Response Contract

Each successful tool response includes:

- `content`: full JSON payload text (non-lossy)
- `structuredContent` envelope:
  - `tool`
  - `category` (`discovery | usage | analysis | report`)
  - `data` (raw tool result object)
  - `summary` (`kind`, `keys`, `rowCount`, `warnings`)
- `_meta` with widget/output template hints

Representative shape:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{ ... full JSON payload ... }"
    }
  ],
  "structuredContent": {
    "tool": "run_analysis",
    "category": "analysis",
    "data": {},
    "summary": {
      "kind": "object",
      "keys": ["rows", "columnHeaders"],
      "rowCount": 42,
      "warnings": []
    }
  },
  "_meta": {
    "openai/outputTemplate": "ui://widget/analytics.html",
    "ui": {
      "resourceUri": "ui://widget/analytics.html"
    }
  }
}
```

#### Widget Resources

- `ui://widget/analytics.html`
- `ui://widget/kpi.html`

Category mapping:

- `usage` -> KPI widget
- all other categories -> analytics widget

#### ChatGPT Error Codes

Tool failures are surfaced with prefixed codes (for example `[E_MAPP_API] ...`) and logged with tool-outcome telemetry.

Common codes:

- `E_AUTH_REQUIRED`
- `E_CREDENTIALS_MISSING`
- `E_MAPP_AUTH`
- `E_MAPP_API`
- `E_INTERNAL`

Non-fatal warning code:

- `WARN_QUOTA_ZERO` (quota maximum is `0`)

---

### POST/GET/DELETE `/api/mcp-chatgpt/mcp`

**File:** `app/api/mcp-chatgpt/mcp/route.ts`

Compatibility MCP endpoint for clients that automatically append `/mcp` to a configured base path.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

#### Request

Same Streamable HTTP transport as `/api/mcp-chatgpt`.

- **Method:** `POST`, `GET`, `DELETE`
- **Content-Type:** `application/json`
- **Max duration:** 120 seconds

#### Notes

- Tool inventory and response contract are the same as `/api/mcp-chatgpt`.
- Use this route only when a client cannot target `/api/mcp-chatgpt` directly.

---

### GET `/api/settings`

**File:** `app/api/settings/route.ts`

Returns the credential configuration status for the authenticated user. Does **not** return the actual credential values — `clientId` is partially masked and `clientSecret` is never returned.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

#### Response

**200 OK — credentials configured:**

```json
{
  "configured": true,
  "clientId": "abc****ef",
  "baseUrl": "https://intelligence.eu.mapp.com"
}
```

`clientId` masking: first 3 characters + `****` + last 2 characters. If the string is ≤ 5 characters, returns `"****"`.

**200 OK — no credentials stored:**

```json
{
  "configured": false
}
```

**401 Unauthorized:**

```json
{ "error": "Missing or invalid Authorization header" }
```

or

```json
{ "error": "Invalid or expired token" }
```

**500 Internal Server Error:**

```json
{ "error": "Failed to load credential status." }
```

---

### POST `/api/settings`

**File:** `app/api/settings/route.ts`

Saves (or overwrites) the Mapp Intelligence API credentials for the authenticated user. Credentials are encrypted with AES-256-GCM before being written to Redis.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

#### Request Body

```json
{
  "clientId": "string",
  "clientSecret": "string"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `clientId` | string | Yes | — | Mapp Intelligence API client ID |
| `clientSecret` | string | Yes | — | Mapp Intelligence API client secret |
| `baseUrl` | string | No | — | Optional legacy field; if present, it must equal `https://intelligence.eu.mapp.com` |

#### Response

**200 OK:**

```json
{
  "success": true,
  "message": "Mapp credentials saved successfully",
  "clientId": "abc****ef"
}
```

**400 Bad Request — missing fields:**

```json
{ "error": "clientId and clientSecret are required" }
```

**400 Bad Request — malformed body:**

```json
{ "error": "Invalid JSON body" }
```

**401 Unauthorized:**

```json
{ "error": "Missing or invalid Authorization header" }
```

**500 Internal Server Error:**

```json
{ "error": "Failed to save credentials. Please try again." }
```

---

### DELETE `/api/settings`

**File:** `app/api/settings/route.ts`

Removes the stored Mapp credentials for the authenticated user from Redis. After deletion, any tool calls via `/api/mcp` will return an error indicating credentials are not configured.

#### Authentication

| Scheme | Required |
|---|---|
| Bearer token (Auth0 JWT) | Yes |

#### Request Body

None.

#### Response

**200 OK:**

```json
{
  "success": true,
  "message": "Mapp credentials deleted"
}
```

**401 Unauthorized:**

```json
{ "error": "Missing or invalid Authorization header" }
```

**500 Internal Server Error:**

```json
{ "error": "Failed to delete credentials." }
```

---

### POST `/api/setup`

**File:** `app/api/setup/route.ts`

Saves Mapp credentials during the Auth0 Post-Login Action redirect flow (onboarding). This endpoint is called by the `/setup` page when a first-time user enters their Mapp API credentials after being redirected from Auth0.

This endpoint uses a **different authentication scheme** from the other API endpoints. Instead of an Auth0 Bearer JWT, it accepts a session token signed by the Auth0 Post-Login Action using HS256 with the shared `AUTH0_ACTION_SECRET`.

#### Authentication

| Scheme | Required |
|---|---|
| Session token (HS256) in request body | Yes |

The session token is **not** passed in the `Authorization` header — it is part of the JSON body.

#### Request Body

```json
{
  "session_token": "string",
  "clientId": "string",
  "clientSecret": "string"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `session_token` | string | Yes | — | HS256 JWT issued by Auth0 Post-Login Action |
| `clientId` | string | Yes | — | Mapp Intelligence API client ID |
| `clientSecret` | string | Yes | — | Mapp Intelligence API client secret |
| `baseUrl` | string | No | — | Optional legacy field; if present, it must equal `https://intelligence.eu.mapp.com` |

#### Token Verification

The server verifies the session token as follows:

```
jose.jwtVerify(session_token, AUTH0_ACTION_SECRET, { algorithms: ["HS256"] })
```

The `sub` claim from the verified token is used as the Redis key for credential storage. This ensures credentials are saved for the correct user even though no Auth0 Bearer JWT has been issued yet (the OAuth flow has not completed).

#### Response

**200 OK:**

```json
{
  "success": true,
  "message": "Mapp credentials saved successfully"
}
```

**400 Bad Request — missing fields:**

```json
{ "error": "session_token is required" }
```

or

```json
{ "error": "clientId and clientSecret are required" }
```

**401 Unauthorized — invalid or expired session token:**

```json
{ "error": "Invalid or expired session token" }
```

**401 Unauthorized — token missing `sub`:**

```json
{ "error": "Session token missing sub claim" }
```

**500 Internal Server Error — missing server config:**

```json
{ "error": "Server misconfigured: AUTH0_ACTION_SECRET not set" }
```

---

### GET `/api/auth/login`

**File:** `app/api/auth/login/route.ts`

Starts the `/settings` OAuth flow and redirects to Auth0 `/authorize`.
The endpoint generates a random OAuth `state` and PKCE verifier/challenge,
stores `state` and verifier in short-lived HttpOnly cookies, and includes
`state` + PKCE challenge in the Auth0 authorize request.

#### Authentication

None.

#### Response

**302 Redirect** to Auth0 `/authorize` with:

- `response_type=code`
- `client_id=<AUTH0_SETTINGS_CLIENT_ID>`
- `redirect_uri=<origin>/api/auth/callback`
- `audience=<AUTH0_AUDIENCE>`
- `scope=openid profile email`
- `state=<random>`
- `code_challenge=<S256 challenge>`
- `code_challenge_method=S256`

---

### GET `/api/auth/callback`

**File:** `app/api/auth/callback/route.ts`

OAuth 2.0 authorization code callback handler for the `/settings` page login flow. This endpoint receives the authorization code from Auth0, exchanges it for an access token, and redirects the browser to `/settings` with the token in the URL fragment.

#### Authentication

None — this endpoint is called by the browser during the OAuth redirect.

#### Query Parameters

| Parameter | Required | Notes |
|---|---|---|
| `code` | Yes (unless `error` present) | Authorization code from Auth0 |
| `state` | Yes | Must match the state cookie set by `/api/auth/login` |
| `error` | No | Auth0 error code (e.g. `access_denied`) |
| `error_description` | No | Human-readable error description |

The callback also requires the PKCE verifier cookie set by `/api/auth/login`.

#### Token Exchange

When `code` is present, the endpoint performs:

```
POST https://mapp-product.eu.auth0.com/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "<AUTH0_SETTINGS_CLIENT_ID>",
  "client_secret": "<AUTH0_SETTINGS_CLIENT_SECRET>",
  "code": "<code>",
  "redirect_uri": "https://mapp-intelligence-mcp-remote.vercel.app/api/auth/callback",
  "audience": "<AUTH0_AUDIENCE>",
  "code_verifier": "<pkce_verifier_from_cookie>"
}
```

#### Response

This endpoint always responds with an HTTP redirect, never a JSON body.

**Success — redirects to:**
```
/settings#access_token=<access_token>
```

**Error (from Auth0 or token exchange failure) — redirects to:**
```
/settings#error=<url_encoded_error_message>
```

**500 Internal Server Error** (missing server configuration):

```json
{ "error": "Auth configuration incomplete for settings page" }
```

#### Security Notes

- The access token is placed in the URL fragment (`#access_token=...`), not as a query parameter
- Fragments are never sent in HTTP requests to the server (the browser keeps them client-side only)
- The `/settings` JavaScript reads the token from `window.location.hash` and immediately clears the fragment
- This prevents the token from appearing in server access logs or `Referer` headers

---

### GET `/api/health`

**File:** `app/api/health/route.ts`

Health and readiness check endpoint. Reports whether all required environment variables are present. Suitable for use with uptime monitors and load balancer health checks.

#### Authentication

None.

#### Response

**200 OK — all variables configured:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-26T15:00:00.000Z"
}
```

**503 Service Unavailable — one or more variables missing:**

```json
{
  "status": "degraded",
  "timestamp": "2026-02-26T15:00:00.000Z"
}
```
> **Note:** This endpoint intentionally returns minimal details. Missing config keys are logged server-side, not exposed in the response body.

---

### GET `/.well-known/oauth-protected-resource`

**File:** `app/.well-known/oauth-protected-resource/route.ts`

OAuth 2.0 Protected Resource Metadata endpoint, per [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728). MCP clients fetch this endpoint to discover the authorization server before initiating Dynamic Client Registration or the authorization code flow.

#### Authentication

None.

#### Response

**200 OK:**

```json
{
  "resource": "https://mapp-intelligence-mcp-remote.vercel.app",
  "authorization_servers": [
    "https://mapp-product.eu.auth0.com"
  ]
}
```

#### CORS

The `OPTIONS` method is handled by `metadataCorsOptionsRequestHandler()` (from `mcp-handler`), enabling browser-based MCP clients to access this endpoint cross-origin.

---

## Error Responses

### 401 Unauthorized

Returned when the `Authorization` header is missing, malformed, or contains an invalid/expired JWT.

```json
{ "error": "Missing or invalid Authorization header" }
```

or

```json
{ "error": "Invalid or expired token" }
```

The `WWW-Authenticate` header may be present on `/api/mcp` responses (set by the `mcp-handler` library).

### 400 Bad Request

Returned when required request body fields are missing or the body is not valid JSON.

```json
{ "error": "<descriptive message>" }
```

### 500 Internal Server Error

Returned when a server-side operation fails (Redis write error, missing environment variable, etc.).

```json
{ "error": "<descriptive message>" }
```

### MCP Tool Errors

When a tool call fails (credentials not configured, Mapp API error, etc.), the error is returned inside the MCP protocol response structure rather than as an HTTP error:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Mapp Intelligence credentials not configured. Please save your Mapp client_id and client_secret via the settings endpoint first."
    }
  ],
  "isError": true
}
```
