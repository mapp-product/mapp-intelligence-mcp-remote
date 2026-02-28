# Mapp Intelligence MCP Server (Remote)

Remote, multi-tenant MCP server for the [Mapp Intelligence Analytics API](https://docs.mapp.com/apidocs/analytics-api), deployed on Vercel with Auth0 OAuth 2.0 authentication.

This is the remote/hosted version of [mapp-intelligence-mcp](https://github.com/mapp-product/mapp-intelligence-mcp), adapted from local stdio transport to Streamable HTTP with per-user credential management.

For a full click-by-click setup walkthrough, see the step-by-step guide:
[Configure the remote MCP server](https://mapp.atlassian.net/wiki/x/GABaOw)

## Features

- **13 MCP tools** covering analysis queries, reports, segments, dimensions/metrics discovery, time filters, and usage tracking
- **ChatGPT analytics endpoint** (`/api/mcp-chatgpt`) aligned with the same 13 core tools as `/api/mcp`, plus ChatGPT-native structured presentation
- **Structured tool outputs** using MCP `outputSchema` + `structuredContent` for reliable in-chat rendering
- **Widget resources** (`ui://widget/analytics.html`, `ui://widget/kpi.html`) for ChatGPT-native visual result cards
- **Auth0 OAuth 2.0** with per-request JWT verification
- **Per-user Mapp credentials** stored and resolved per authenticated user
- **Fixed downstream endpoint** — all requests are pinned to `https://intelligence.eu.mapp.com`
- **Encrypted at-rest storage** — credentials encrypted with AES-256-GCM and stored in Redis
- **Streamable HTTP transport** — stateless MCP over HTTPS

## Architecture

```
MCP Client (Claude, Cursor, ChatGPT, etc.)
    │
    │ Streamable HTTP + Bearer token
    ▼
┌───────────────────────────────────┐
│  Vercel (Next.js)                 │
│                                   │
│  /api/mcp          → MCP handler  │
│  /api/mcp-chatgpt  → ChatGPT MCP  │
│    ├─ Auth0 JWT verification      │
│    ├─ Load user creds from Redis  │
│    └─ Execute Mapp API calls      │
│                                   │
│  /api/settings     → CRUD creds   │
│  /api/setup        → Onboarding   │
│  /api/health       → Health check │
│  /.well-known/...  → OAuth meta   │
└───────────────────────────────────┘
    │                        │
    ▼                        ▼
  Auth0                  Upstash Redis
  (OAuth AS)            (Encrypted creds)
```

## Quick Start

### 1. Connect as an MCP Client

Add this server to your MCP client configuration:

**Claude Desktop / Claude.ai Custom Connector**
- Name: `Mapp Intelligence`
- URL: `https://<your-deployment>.vercel.app/api/mcp`

**ChatGPT Connector (Developer Mode)**
- Primary URL: `https://<your-deployment>.vercel.app/api/mcp-chatgpt`
- Compatibility URL (for clients that auto-append `/mcp`): `https://<your-deployment>.vercel.app/api/mcp-chatgpt/mcp`

**Cursor (`.cursor/mcp.json`)**
```json
{
  "mcpServers": {
    "mapp-intelligence": {
      "url": "https://<your-deployment>.vercel.app/api/mcp"
    }
  }
}
```

### 2. Authenticate

When connecting, users are redirected to Auth0 for login/signup.

Hosted deployment access policy:
- login is restricted to `@mapp.com` accounts by the bundled Auth0 post-login action (`auth0-action.js`)

Self-hosted policy customization:
- remove or adapt the domain check in `auth0-action.js` if you need broader access rules

### 3. Configure Mapp Credentials

After OAuth login, credentials can be configured in one of these ways:

**Option A (recommended): automatic first-login setup flow**
- first-time users are redirected to `/setup`
- submit `clientId` + `clientSecret` and continue back to the OAuth flow

**Option B: settings page**
- open `https://<your-deployment>.vercel.app/settings`
- sign in and save/update/delete stored credentials

**Option C (advanced): settings API with a bearer token**
```bash
curl -X POST https://<your-deployment>.vercel.app/api/settings \
  -H "Authorization: Bearer <your-oauth-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "YOUR_MAPP_CLIENT_ID",
    "clientSecret": "YOUR_MAPP_CLIENT_SECRET"
  }'
```

### 4. Use the Tools

Now all 13 Mapp Intelligence tools are available through your MCP client:

| Category | Tools |
|----------|-------|
| Discovery | `list_dimensions_and_metrics`, `list_segments`, `list_dynamic_timefilters` |
| Analysis | `run_analysis`, `create_analysis_query`, `check_analysis_status`, `get_analysis_result`, `cancel_analysis_query` |
| Reports | `run_report`, `create_report_query`, `check_report_status`, `cancel_report_query` |
| Quota | `get_analysis_usage` |

For ChatGPT-focused analysis flows, connect to `/api/mcp-chatgpt` (or `/api/mcp-chatgpt/mcp` for compatibility). The ChatGPT endpoint adds structured output and widget metadata on top of the same core tools.

## Deployment

### Prerequisites

- [Vercel](https://vercel.com) project
- [Auth0](https://auth0.com) tenant
- Upstash Redis (via Vercel KV integration or direct Upstash variables)

### Environment Variables

| Variable | Required | Scope | Description |
|----------|----------|-------|-------------|
| `AUTH0_DOMAIN` | Yes | Server | Auth0 tenant domain (for JWT verify + OAuth redirects) |
| `AUTH0_AUDIENCE` | Yes | Server | Auth0 API identifier / JWT audience |
| `AUTH0_ACTION_SECRET` | Yes | Server | Shared secret for onboarding `session_token` verification |
| `AUTH0_SETTINGS_CLIENT_ID` | Yes | Server | Auth0 Regular Web App client ID used by `/settings` login |
| `AUTH0_SETTINGS_CLIENT_SECRET` | Yes | Server | Auth0 Regular Web App client secret used by callback exchange |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | Yes | Client | Auth0 domain used by `/setup` page continuation redirect |
| `NEXT_PUBLIC_AUTH0_AUDIENCE` | Recommended | Client | Public audience value for client-side auth context |
| `NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID` | Recommended | Client | Public settings client ID for client-side auth context |
| `MAPP_API_BASE_URL` | Yes | Server | Must be `https://intelligence.eu.mapp.com` |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | Server | 64-char hex key for AES-256-GCM |
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | Yes | Server | Redis REST URL |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | Yes | Server | Redis REST token |

`KV_REST_API_*` takes precedence when both KV and UPSTASH variable pairs are set.

### Auth0 Setup

1. Create an API in Auth0 Dashboard (RS256) and set its identifier to your MCP audience URL.
2. Enable OIDC Dynamic Client Registration for MCP clients.
3. Create a Regular Web Application for `/settings` and configure callback URL `/api/auth/callback`.
4. Configure and deploy the bundled post-login action from `auth0-action.js`.
5. Set Auth0 action secrets:
   - `SETUP_URL` = `https://<your-deployment>.vercel.app/setup`
   - `SESSION_TOKEN_SECRET` = same value as `AUTH0_ACTION_SECRET`
   - `AUTH0_DOMAIN` = your Auth0 tenant domain

### Deploy

```bash
npm install
vercel deploy --prod
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/mcp` | GET, POST, DELETE | OAuth Bearer | Generic MCP Streamable HTTP endpoint |
| `/api/mcp-chatgpt` | GET, POST, DELETE | OAuth Bearer | ChatGPT-focused MCP endpoint with structured/widget metadata |
| `/api/mcp-chatgpt/mcp` | GET, POST, DELETE | OAuth Bearer | Compatibility endpoint for clients that append `/mcp` |
| `/api/settings` | GET | Bearer | Check credential status |
| `/api/settings` | POST | Bearer | Save Mapp credentials |
| `/api/settings` | DELETE | Bearer | Remove credentials |
| `/api/setup` | POST | Session token in body | Save onboarding credentials during post-login redirect |
| `/api/auth/login` | GET | None | Start settings OAuth (`state` + PKCE) |
| `/api/auth/callback` | GET | None | OAuth callback for settings login |
| `/api/health` | GET | None | Health/readiness check |
| `/.well-known/oauth-protected-resource` | GET | None | OAuth protected resource metadata |

## Documentation

- [Step-by-step remote setup guide (Atlassian Wiki)](https://mapp.atlassian.net/wiki/x/GABaOw)
- [API reference](./docs/api-reference.md)
- [MCP tools reference](./docs/mcp-tools.md)
- [Auth0 configuration](./docs/auth0-configuration.md)
- [Vercel deployment guide](./docs/vercel-deployment.md)
- [Architecture overview](./docs/architecture.md)

## Security

- Mapp credentials encrypted at rest with AES-256-GCM
- Auth0 JWT tokens verified on every request via JWKS
- Settings OAuth flow hardened with `state` + PKCE
- Onboarding flow secured with short-lived signed session tokens
- Per-user credential isolation by Auth0 `sub`
- Sensitive values injected via environment variables only

## License

MIT
