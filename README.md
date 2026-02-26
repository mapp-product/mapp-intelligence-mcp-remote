# Mapp Intelligence MCP Server (Remote)

Remote, multi-tenant MCP server for the [Mapp Intelligence Analytics API](https://docs.mapp.com/apidocs/analytics-api), deployed on Vercel with Auth0 OAuth 2.0 authentication.

This is the remote/hosted version of [mapp-intelligence-mcp](https://github.com/mapp-product/mapp-intelligence-mcp), adapted from local stdio transport to Streamable HTTP with per-user credential management.

## Features

- **13 MCP tools** covering analysis queries, reports, segments, dimensions/metrics discovery, time filters, and usage tracking
- **Auth0 OAuth 2.0** — users authenticate via Auth0 Universal Login (username/password signup)
- **Per-user Mapp credentials** — each user stores their own `client_id` / `client_secret` via the settings API
- **Encrypted at-rest storage** — credentials encrypted with AES-256-GCM, stored in Vercel KV
- **Request-scoped credential resolution** — each MCP tool call uses the authenticated user's own Mapp API credentials
- **Streamable HTTP transport** — efficient stateless transport (no persistent connections)
- **Production-ready** — health endpoints, environment-based configuration, zero hardcoded secrets

## Architecture

```
MCP Client (Claude, Cursor, etc.)
    │
    │ Streamable HTTP + Bearer token
    ▼
┌───────────────────────────────────┐
│  Vercel (Next.js)                 │
│                                   │
│  /api/mcp          → MCP handler  │
│    ├─ Auth0 JWT verification      │
│    ├─ Load user creds from KV     │
│    └─ Execute Mapp API calls      │
│                                   │
│  /api/settings     → CRUD creds   │
│  /api/health       → Health check │
│  /.well-known/...  → OAuth meta   │
└───────────────────────────────────┘
    │                        │
    ▼                        ▼
  Auth0                  Vercel KV
  (OAuth AS)            (Encrypted creds)
```

## Quick Start

### 1. Connect as an MCP Client

Add this server to your MCP client configuration:

**Claude Desktop / Claude.ai Custom Connector:**
- Name: `Mapp Intelligence`
- URL: `https://<your-deployment>.vercel.app/api/mcp`

**Cursor (`.cursor/mcp.json`):**
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

When connecting, you'll be redirected to Auth0 for login/signup. Create an account with username/password.

### 3. Save Your Mapp Credentials

After authenticating, save your Mapp Intelligence API credentials:

```bash
curl -X POST https://<your-deployment>.vercel.app/api/settings \
  -H "Authorization: Bearer <your-oauth-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "YOUR_MAPP_CLIENT_ID",
    "clientSecret": "YOUR_MAPP_CLIENT_SECRET",
    "baseUrl": "https://intelligence.eu.mapp.com"
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

## Deployment

### Prerequisites

- [Vercel](https://vercel.com) account with a project
- [Auth0](https://auth0.com) tenant
- Vercel KV store attached to the project

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AUTH0_DOMAIN` | Auth0 tenant domain (e.g. `your-tenant.us.auth0.com`) |
| `AUTH0_AUDIENCE` | Auth0 API identifier / audience |
| `CREDENTIAL_ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM |
| `KV_REST_API_URL` | Auto-set by Vercel/Upstash Redis integration |
| `KV_REST_API_TOKEN` | Auto-set by Vercel/Upstash Redis integration |

### Auth0 Setup

1. Create an API in Auth0 Dashboard → Applications → APIs
   - Identifier: your deployment URL (e.g. `https://mapp-mcp.vercel.app/api/mcp`)
   - Signing Algorithm: RS256
2. Enable **OIDC Dynamic Application Registration** in Settings → Advanced
3. Enable a **Database connection** (Username-Password-Authentication)
4. Promote the connection to domain-level via the Management API

### Deploy

```bash
npm install
vercel deploy --prod
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/mcp` | GET, POST, DELETE | OAuth Bearer | MCP Streamable HTTP endpoint |
| `/api/settings` | GET | Bearer | Check credential status |
| `/api/settings` | POST | Bearer | Save Mapp credentials |
| `/api/settings` | DELETE | Bearer | Remove credentials |
| `/api/health` | GET | None | Health/readiness check |
| `/.well-known/oauth-protected-resource` | GET | None | OAuth metadata |

## Security

- All Mapp credentials encrypted at rest with AES-256-GCM
- Auth0 JWT tokens verified on every request using JWKS
- No secrets in source code or git
- Environment variables for all sensitive configuration
- Per-user isolation — users can only access their own credentials

## License

MIT
