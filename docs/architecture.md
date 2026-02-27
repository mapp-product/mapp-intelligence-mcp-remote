# Architecture Overview

Mapp Intelligence MCP Remote Server is a **multi-tenant, remote MCP (Model Context Protocol) server** that exposes the Mapp Intelligence Analytics API to AI clients such as Claude and Cursor. It is built with **Next.js 15**, deployed on **Vercel**, uses **Auth0** for OAuth 2.0 authentication, and stores encrypted per-user Mapp credentials in **Upstash Redis** (provisioned via Vercel KV).

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Deep-Dives](#component-deep-dives)
   - [MCP Transport Layer](#mcp-transport-layer)
   - [Authentication Layer](#authentication-layer-libauthts)
   - [Encryption Layer](#encryption-layer-libcryptots)
   - [Credential Store](#credential-store-libcredential-storets)
   - [Mapp API Client](#mapp-api-client-libmapp-apits)
   - [MCP Tools](#mcp-tools-libtoolsts)
4. [Request Flow](#request-flow)
5. [Security Model](#security-model)

---

## High-Level Overview

| Concern | Technology |
|---|---|
| Hosting & routing | Vercel (Next.js 15 serverless functions) |
| MCP protocol | `mcp-handler` library, Streamable HTTP transport |
| Authentication | Auth0 (OAuth 2.0 / OIDC), RS256 JWTs |
| Credential storage | Upstash Redis via Vercel KV |
| Credential encryption | AES-256-GCM (Web Crypto API) |
| Downstream API | Mapp Intelligence Analytics REST API |

The server is **stateless at the application layer** — no session state is kept in memory between requests. All per-user state (Mapp API credentials) lives in Redis, encrypted. Auth state is carried entirely in short-lived Auth0 JWTs verified on every request.

---

## Architecture Diagram

```
MCP Client (Claude, Cursor, etc.)
    │
    │ Streamable HTTP + Bearer token
    ▼
┌──────────────────────────────────────┐
│  Vercel (Next.js 15)                 │
│                                      │
│  /api/mcp           → MCP handler    │
│    ├─ Auth0 JWT verification (RS256) │
│    ├─ Load user creds from Redis     │
│    └─ Execute Mapp API calls         │
│                                      │
│  /api/setup          → Onboarding    │
│    └─ Session token (HS256) auth     │
│                                      │
│  /api/settings       → CRUD creds   │
│    └─ Auth0 JWT (RS256) auth         │
│                                      │
│  /api/auth/login     → OAuth init    │
│    └─ state + PKCE cookie setup      │
│                                      │
│  /api/auth/callback  → OAuth code   │
│    └─ state+PKCE validation + token  │
│                                      │
│  /api/health         → Health check  │
│  /.well-known/...    → OAuth meta    │
└──────────────────────────────────────┘
    │          │            │
    ▼          ▼            ▼
  Auth0    Upstash      Mapp Intelligence
  (OAuth)  Redis (KV)   Analytics API
```

---

## Component Deep-Dives

### MCP Transport Layer

**File:** `app/api/mcp/route.ts`  
**Library:** `mcp-handler` (`createMcpHandler`, `withMcpAuth`)

The MCP endpoint uses **Streamable HTTP transport** — stateless, request/response over HTTPS with no persistent WebSocket connection. This is well-suited for Vercel serverless functions.

```typescript
const baseHandler = createMcpHandler(
  (server) => { registerTools(server); },
  {},
  {
    basePath: "/api",
    maxDuration: 120,
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);
```

Key configuration:
- `basePath: "/api"` — tells the MCP protocol layer where the server lives
- `maxDuration: 120` — extends the Vercel function timeout to 120 seconds (needed for long-running analysis polls)
- `verboseLogs` — enabled only outside production

**Auth wrapping:**

```typescript
const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});
```

`withMcpAuth` intercepts every request, extracts the `Authorization: Bearer <token>` header, and calls `verifyToken`. If verification fails, the request is rejected before any tool code runs.

**`verifyToken` callback:**

```typescript
const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = await verifyAuth0Token(bearerToken);
  if (!payload) return undefined;
  return {
    token: bearerToken,
    scopes: payload.scope ? payload.scope.split(" ") : [],
    clientId: payload.sub,
    extra: {
      sub: payload.sub,
      iss: payload.iss,
    },
  };
};
```

The `extra` object is threaded through the MCP framework's `authInfo` context, making `sub` available to every tool handler via `authInfo.extra.sub`.

The route exports `GET`, `POST`, and `DELETE` handlers, all pointing to the same wrapped handler (MCP Streamable HTTP uses all three methods).

---

### Authentication Layer (`lib/auth.ts`)

**Library:** `jose`

Handles RS256 JWT verification against Auth0's JWKS endpoint.

**JWKS initialization (lazy singleton):**

```typescript
let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    const domain = process.env.AUTH0_DOMAIN;
    jwks = jose.createRemoteJWKSet(
      new URL(`https://${domain}/.well-known/jwks.json`)
    );
  }
  return jwks;
}
```

The JWKS client is created once and cached for the lifetime of the serverless function instance. It handles key rotation automatically — if a token references a `kid` not currently in the cached keyset, `jose` will re-fetch the JWKS.

**Verification:**

```typescript
const { payload } = await jose.jwtVerify(token, getJWKS(), {
  issuer: `https://${domain}/`,
  audience: audience,   // AUTH0_AUDIENCE env var
});
```

Enforced claims:
- `iss`: must be `https://{AUTH0_DOMAIN}/`
- `aud`: must include `AUTH0_AUDIENCE`
- `sub`: must be present (the user's unique Auth0 identity)
- Signature: verified against the RS256 public key from JWKS

**`TokenPayload` interface:**

```typescript
export interface TokenPayload {
  sub: string;
  aud: string | string[];
  iss: string;
  scope?: string;
  [key: string]: unknown;
}
```

Returns `null` on any verification failure (expired token, bad signature, wrong audience, etc.) without throwing — the caller handles the `null` case by returning `401`.

---

### Encryption Layer (`lib/crypto.ts`)

**API:** Web Crypto (`crypto.subtle`) — available natively in Node 20+ and all Vercel runtimes.

**Parameters:**

| Parameter | Value |
|---|---|
| Algorithm | AES-GCM (AES-256-GCM) |
| Key length | 256 bits |
| IV length | 12 bytes (96 bits) — NIST recommended for GCM |
| Tag length | 128 bits |
| Key source | `CREDENTIAL_ENCRYPTION_KEY` env var (64-char hex → 32 bytes) |

**Key import:**

```typescript
function getKeyMaterial(): Uint8Array {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  // Must be exactly 64 hex chars (32 bytes / 256 bits)
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  const raw = getKeyMaterial();
  return crypto.subtle.importKey("raw", raw.buffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
```

The key is re-imported on every `encrypt`/`decrypt` call (no caching). This is intentional — `CryptoKey` objects are non-extractable and tied to the current execution context.

**Wire format:**

```
[ IV (12 bytes) ][ ciphertext + GCM auth tag (N + 16 bytes) ]
```

The entire blob is base64-encoded and stored as a string in Redis. The GCM authentication tag is appended by `crypto.subtle.encrypt` automatically.

**Encrypt:**

```typescript
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key, encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Buffer.from(combined).toString("base64");
}
```

A fresh random IV is generated per encryption call. Reusing IVs with GCM is catastrophic (it breaks confidentiality and authentication), so this is critical.

**Decrypt:**

```typescript
export async function decrypt(encoded: string): Promise<string> {
  const key = await importKey();
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key, ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
```

Decryption will throw if the GCM tag doesn't match (tampered ciphertext or wrong key). This is caught in `loadCredentials`.

---

### Credential Store (`lib/credential-store.ts`)

**Library:** `@upstash/redis`

Provides a simple CRUD interface for per-user Mapp credentials backed by Redis.

**Redis client initialization:**

```typescript
function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return new Redis({ url, token });
}
```

Supports both Vercel KV naming (`KV_REST_API_*`) and direct Upstash naming (`UPSTASH_REDIS_REST_*`), with Vercel KV taking precedence.

**Key pattern:** `mapp_creds:{sub}`

Where `sub` is the Auth0 subject claim (e.g. `auth0|64abc123def456`). This guarantees per-user isolation — no user can access another user's credentials.

**StoredCredentials schema:**

```typescript
interface StoredCredentials {
  clientId: string;
  clientSecret: string;
}
```

**Operations:**

| Function | Redis operation | Notes |
|---|---|---|
| `saveCredentials(sub, creds)` | `SET mapp_creds:{sub} <encrypted>` | Encrypts JSON blob before write |
| `loadCredentials(sub)` | `GET mapp_creds:{sub}` | Decrypts after read, returns null if missing or corrupt |
| `deleteCredentials(sub)` | `DEL mapp_creds:{sub}` | Used by DELETE /api/settings |
| `hasCredentials(sub)` | `EXISTS mapp_creds:{sub}` | Avoids decrypt overhead for status checks |

The downstream Mapp API base URL is fixed server-side to `https://intelligence.eu.mapp.com` via `MAPP_API_BASE_URL`.

---

### Mapp API Client (`lib/mapp-api.ts`)

The API client is **multi-tenant by design**: every function accepts a `MappCredentials` object rather than reading from environment variables.

**`MappCredentials` interface:**

```typescript
export interface MappCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}
```

`baseUrl` remains in the in-memory type for compatibility, but outbound requests are pinned to `MAPP_API_BASE_URL` (`https://intelligence.eu.mapp.com`).

**Token cache:**

```typescript
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
```

Keyed by a hash of `(clientId, clientSecret, baseUrl)`. Tokens are cached in-memory within a function instance lifetime. The cache is checked on every API call, refreshing 60 seconds before expiry:

```typescript
if (cached && Date.now() < cached.expiresAt - 60_000) {
  return cached.token;
}
```

> **Note:** Because Vercel serverless functions can have multiple concurrent instances, the token cache is per-instance, not globally shared. This means a given user may authenticate with the Mapp API more than once across concurrent requests. This is acceptable — Mapp tokens are short-lived and re-fetching is cheap.

**Token acquisition (client_credentials flow):**

```
POST {MAPP_API_BASE_URL}/analytics/api/oauth/token
  ?grant_type=client_credentials
  &scope=mapp.intelligence-api
Authorization: Basic base64({clientId}:{clientSecret})
```

**HTTP helpers:**

| Function | Method | Notes |
|---|---|---|
| `apiGet(creds, path, params?)` | GET | Appends query params from object |
| `apiPost(creds, path, body)` | POST | JSON body, `Content-Type: application/json` |
| `apiDelete(creds, path)` | DELETE | Returns `{ success: true, status }` |
| `apiGetAbsolute(creds, absoluteUrl)` | GET | Used for polling `resultUrl` / `statusUrl` (full URLs), origin-validated against `MAPP_API_BASE_URL` |

All helpers throw on non-2xx responses with the HTTP status code and body text included in the error message.

**Polling helper:**

```typescript
export async function pollForResult(
  creds: MappCredentials,
  statusUrl: string,
  maxAttempts = 30,
  intervalMs = 2000
)
```

Used by `run_analysis` for async queries. Polls up to 30 times with 2-second intervals (60 seconds total). Returns the status object once `resultUrl` appears. Throws if the query enters `FAILED` or `ERROR` state, or if polling is exhausted.

---

### MCP Tools (`lib/tools.ts`)

All 13 tools follow the same structural pattern:

1. Extract `sub` from `authInfo.extra` via `getCredsFromContext`
2. Load and decrypt credentials from Redis
3. Call the Mapp Analytics API
4. Return JSON-stringified result as MCP text content

**`getCredsFromContext` helper:**

```typescript
async function getCredsFromContext(
  extra: Record<string, unknown> | undefined
): Promise<MappCredentials> {
  const sub = extra?.sub as string | undefined;
  if (!sub) throw new Error("Authentication required. Please connect via OAuth first.");

  const creds = await loadCredentials(sub);
  if (!creds) throw new Error(
    "Mapp Intelligence credentials not configured. Please save your Mapp client_id and client_secret via the settings endpoint first."
  );

  return creds;
}
```

Error messages are user-facing (returned to the MCP client).

**Tool inventory:**

| Tool | Category | Mapp API Endpoint |
|---|---|---|
| `list_dimensions_and_metrics` | Discovery | `GET /analytics/api/query-objects` |
| `list_segments` | Discovery | `GET /analytics/api/segments` |
| `list_dynamic_timefilters` | Discovery | `GET /analytics/api/dynamic-timefilters` |
| `get_analysis_usage` | Quota | `GET /analytics/api/analysis-usage/current` |
| `run_analysis` | Analysis | `POST /analytics/api/analysis-query` + polling |
| `create_analysis_query` | Analysis | `POST /analytics/api/analysis-query` (async) |
| `check_analysis_status` | Analysis | `GET /analytics/api/analysis-query/{id}` |
| `get_analysis_result` | Analysis | `GET /analytics/api/analysis-result/{id}` |
| `cancel_analysis_query` | Analysis | `DELETE /analytics/api/analysis-query/{id}` |
| `run_report` | Reports | `POST /analytics/api/report-query` + polling |
| `create_report_query` | Reports | `POST /analytics/api/report-query` (async) |
| `check_report_status` | Reports | `GET /analytics/api/report-query/{id}` |
| `cancel_report_query` | Reports | `DELETE /analytics/api/report-query/{id}` |

See [mcp-tools.md](./mcp-tools.md) for full parameter schemas and usage examples.

---

## Request Flow

The following describes the complete path for a single MCP tool call:

```
 1. MCP Client sends POST /api/mcp
      Headers: Authorization: Bearer <auth0_access_token>
      Body:    MCP protocol payload (tool name + arguments)

 2. withMcpAuth middleware
      - Extracts bearer token from Authorization header
      - Calls verifyToken(req, bearerToken)

 3. verifyToken
      - Calls verifyAuth0Token(bearerToken)
      - jose.jwtVerify() against Auth0 JWKS (RS256)
      - Validates iss, aud claims
      - Returns { sub, iss } in extra field

 4. MCP handler routes to the requested tool

 5. Tool handler entry
      - Calls getCredsFromContext(authInfo.extra)
      - Extracts sub from extra.sub

 6. Credential resolution
      - loadCredentials(sub)
      - Redis GET mapp_creds:{sub}
      - AES-256-GCM decrypt
      - Returns { clientId, clientSecret }

 7. Mapp API call
      - getToken(creds) — client_credentials OAuth flow (cached)
      - HTTP request to Mapp Intelligence API

 8. For async analysis/report queries:
      - pollForResult() polls statusUrl up to 30×2s
      - apiGetAbsolute() fetches resultUrl

 9. Result returned to MCP client
      - { content: [{ type: "text", text: JSON.stringify(result) }] }
```

**Latency contributors:**
- Auth0 JWKS fetch: cached after first request; subsequent verifications are local
- Redis GET + decrypt: ~1–5ms typical Upstash latency + negligible crypto overhead
- Mapp token acquisition: cached; ~50–200ms when cache miss
- Mapp API response: varies by query complexity; async queries may take 10–60s

---

## Security Model

### Secrets management

No secrets (encryption keys, client secrets, API tokens) appear in source code. All secrets are injected via Vercel environment variables at deploy time.

### Credential isolation

Each user's Mapp credentials are stored under `mapp_creds:{sub}` where `sub` is the cryptographically verified Auth0 subject claim. A user cannot access another user's credentials — the `sub` is extracted from the verified JWT, not from a user-supplied parameter.

### Encryption at rest

All Mapp credentials (clientId, clientSecret) are encrypted with AES-256-GCM before being written to Redis. The GCM authentication tag prevents undetected tampering. The encryption key is never stored in Redis; it lives only in the Vercel environment.

### JWT verification on every request

Every request to `/api/mcp` and `/api/settings` verifies the Auth0 JWT signature via JWKS. There is no API key or static secret that could be used instead of a valid JWT. RS256 with JWKS enables automatic key rotation — Auth0 can rotate signing keys and clients will pick up new keys automatically.

### Fragment-based token delivery

The settings page OAuth flow delivers the access token in the URL fragment (`/settings#access_token=...`). Fragment identifiers are never sent to the server in HTTP requests, so the token does not appear in server access logs. The JavaScript reads it from `window.location.hash` and immediately clears the fragment.

### OAuth request integrity

The settings OAuth flow is initiated by `/api/auth/login`, which creates a cryptographically random `state` value and PKCE verifier/challenge pair. `state` and PKCE verifier are stored in short-lived HttpOnly cookies and validated in `/api/auth/callback` before token exchange. This blocks callback CSRF and authorization-code injection.

### Domain restriction

The Auth0 Post-Login Action enforces that only `@mapp.com` email addresses can complete login. This is enforced server-side in the Auth0 action, not in the application layer, so it cannot be bypassed by manipulating client-side code.

### No persistent server-side sessions

The application holds no session state between requests. Every request is independently authenticated. This eliminates entire classes of session-fixation and CSRF attacks.
