# Vercel Deployment Guide

This document covers everything needed to deploy the Mapp Intelligence MCP Remote Server to Vercel, including project settings, environment variables, storage configuration, and post-deploy verification.

---

## Table of Contents

1. [Project Details](#project-details)
2. [Dependencies](#dependencies)
3. [Environment Variables](#environment-variables)
4. [Storage: Vercel KV (Upstash Redis)](#storage-vercel-kv-upstash-redis)
5. [Next.js Configuration](#nextjs-configuration)
6. [Runtime Constraints](#runtime-constraints)
7. [Deployment Steps](#deployment-steps)
8. [Post-Deploy Verification](#post-deploy-verification)
9. [Monitoring & Observability](#monitoring--observability)

---

## Project Details

| Property | Value |
|---|---|
| Project name | `<your-vercel-project-name>` |
| Team | `<your-vercel-team>` |
| Production URL | `https://<your-deployment-domain>` |
| Framework | Next.js 15 |
| Build command | `next build` |
| Output directory | `.next` (default) |
| Node.js version | 24.x |
| Runtime | Node.js serverless functions (not Edge) |
| Repository | `github.com/mapp-product/mapp-intelligence-mcp-remote` |

---

## Dependencies

Runtime dependencies (from `package.json`):

| Package | Version | Purpose |
|---|---|---|
| `next` | `^15.3.0` | App framework, routing, serverless function bundling |
| `react` / `react-dom` | `^19.0.0` | UI for settings and setup pages |
| `mcp-handler` | `^1.0.2` | MCP Streamable HTTP transport, auth wrappers |
| `@upstash/redis` | `^1.36.2` | Upstash Redis REST client for credential storage |
| `jose` | `^6.0.11` | JWT verification (RS256 JWKS) and HS256 session token handling |
| `zod` | `^3.24.0` | MCP tool parameter schema validation |

Dev dependencies:

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.7.0` | Type checking |
| `@types/node` | `^22.0.0` | Node.js type definitions |
| `@types/react` | `^19.0.0` | React type definitions |

---

## Environment Variables

All environment variables must be configured in the **Vercel Dashboard → Project → Settings → Environment Variables** (or via `vercel env add`).

### Required Variables

| Variable | Purpose | Example Value |
|---|---|---|
| `AUTH0_DOMAIN` | Auth0 tenant domain (server-side) | `<your-auth0-domain>` |
| `AUTH0_AUDIENCE` | Auth0 API identifier / JWT audience (server-side) | `https://<your-deployment-domain>/api/mcp` |
| `MAPP_API_BASE_URL` | Fixed downstream Mapp API endpoint | `https://intelligence.eu.mapp.com` |
| `AUTH0_ACTION_SECRET` | Shared HMAC secret for session tokens issued by the Auth0 Post-Login Action | 64-char hex string |
| `AUTH0_SETTINGS_CLIENT_ID` | Auth0 Regular Web App client ID for the settings page OAuth flow | `<your-settings-client-id>` |
| `AUTH0_SETTINGS_CLIENT_SECRET` | Auth0 Regular Web App client secret | (secret, from Auth0 dashboard) |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM encryption key for credential storage | 64-char hex string |
| `KV_REST_API_URL` | Upstash Redis REST URL (auto-set by Vercel KV integration) | `https://...upstash.io` |
| `KV_REST_API_TOKEN` | Upstash Redis REST token (auto-set by Vercel KV integration) | (secret) |

### Client-Side Public Variables

These are exposed to the browser via `NEXT_PUBLIC_` prefix. They contain only non-sensitive discovery information.

| Variable | Purpose | Value |
|---|---|---|
| `NEXT_PUBLIC_AUTH0_DOMAIN` | Auth0 domain for client-side redirect construction | `<your-auth0-domain>` |
| `NEXT_PUBLIC_AUTH0_AUDIENCE` | Audience for client-side authorization requests | same as `AUTH0_AUDIENCE` |
| `NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID` | Client ID for client-side authorization redirect | same as `AUTH0_SETTINGS_CLIENT_ID` |

> **Security note:** Auth0 domain, audience, and client IDs are all considered public information. They appear in the browser's address bar during the OAuth redirect and are discoverable from `/.well-known/oauth-protected-resource`. Do not use `NEXT_PUBLIC_` for secrets like `AUTH0_SETTINGS_CLIENT_SECRET` or `CREDENTIAL_ENCRYPTION_KEY`.

### Generating Secret Values

**`AUTH0_ACTION_SECRET` / `CREDENTIAL_ENCRYPTION_KEY`** — Both require a 64-character hex string (32 random bytes):

```bash
# Generate using OpenSSL
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

These two secrets must be independent — do not reuse the same value for both.

**`AUTH0_ACTION_SECRET`** must match the `SESSION_TOKEN_SECRET` configured in the Auth0 Post-Login Action's secrets. If they diverge, session token verification will fail and the onboarding flow will break.

### Alternative Redis Variable Names

If connecting to Upstash directly (not via Vercel KV integration), the code also accepts:

| Variable | Notes |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Direct Upstash URL (used if `KV_REST_API_URL` is absent) |
| `UPSTASH_REDIS_REST_TOKEN` | Direct Upstash token (used if `KV_REST_API_TOKEN` is absent) |

`KV_REST_API_*` takes precedence over `UPSTASH_REDIS_REST_*` when both are set.

---

## Storage: Vercel KV (Upstash Redis)

### Provisioning

1. In the Vercel dashboard, navigate to **Project → Storage**
2. Create a new **KV** (Key-Value) database
3. Link it to the project
4. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the project's environment

### Usage Pattern

The credential store uses a single Redis string per user:

```
Key:   mapp_creds:{auth0_sub}
Value: base64(AES-256-GCM(JSON({ clientId, clientSecret })))
```

Redis is used as a simple key-value store — no sorted sets, lists, or pub/sub. Any Upstash Redis plan will work; storage requirements are minimal (each record is a few hundred bytes).

### No TTL

Credentials do not have a TTL set. They persist until the user explicitly deletes them via `DELETE /api/settings` or an admin removes them directly from Redis.

### Data Access Patterns

| Operation | Frequency | Notes |
|---|---|---|
| GET (load credentials) | Every tool call | Primary hot path |
| SET (save credentials) | First login + updates | Rare |
| EXISTS (check credentials) | Every GET /api/settings | Cheap |
| DEL (delete credentials) | On user request | Rare |

---

## Next.js Configuration

**File:** `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mcp-handler"],
};

export default nextConfig;
```

`serverExternalPackages: ["mcp-handler"]` is required because `mcp-handler` uses native Node.js modules that cannot be bundled by the Next.js webpack build. This tells Next.js to import it as a standard Node.js `require()` at runtime rather than bundling it into the serverless function artifact.

Without this setting, the `/api/mcp` route will fail to compile or throw runtime errors on Vercel.

---

## Runtime Constraints

### Node.js Serverless (not Edge)

All routes use the Node.js serverless runtime. The Edge runtime is explicitly not used because:
- `mcp-handler` requires Node.js APIs not available in the Edge runtime
- The Web Crypto API usage in `lib/crypto.ts` (`crypto.subtle`) is available in Node 24 and works correctly in Vercel serverless
- `@upstash/redis` works in both runtimes, but keeping everything on Node.js simplifies the setup

### Function Duration

The `/api/mcp` route sets `maxDuration: 120` (120 seconds). This is necessary because:
- MCP analysis queries can be asynchronous, requiring polling
- The `pollForResult` helper polls up to 30 times with 2-second intervals (up to 60 seconds)
- Add network latency and Mapp API processing time, and 120 seconds is the appropriate ceiling

Vercel's default function timeout is 10 seconds on the Hobby plan and 60 seconds on Pro. **A Pro plan or higher is required** to set `maxDuration: 120`.

### Cold Start Behaviour

On cold starts, the first request to a serverless function instance will:
1. Fetch the Auth0 JWKS endpoint (initializes the JWKS client)
2. Establish an Upstash Redis REST connection
3. Potentially fetch a Mapp API token

These add ~200–500ms on cold starts. Subsequent requests to warm instances avoid these costs.

---

## Deployment Steps

### Initial Deployment

```bash
# 1. Clone the repository
git clone https://github.com/mapp-product/mapp-intelligence-mcp-remote.git
cd mapp-intelligence-mcp-remote

# 2. Install dependencies
npm install

# 3. Link to Vercel project (first time only)
npx vercel link

# 4. Set environment variables
# Option A: Via CLI (prompts for value)
npx vercel env add AUTH0_DOMAIN production
npx vercel env add AUTH0_AUDIENCE production
npx vercel env add MAPP_API_BASE_URL production
npx vercel env add AUTH0_ACTION_SECRET production
npx vercel env add AUTH0_SETTINGS_CLIENT_ID production
npx vercel env add AUTH0_SETTINGS_CLIENT_SECRET production
npx vercel env add CREDENTIAL_ENCRYPTION_KEY production
npx vercel env add NEXT_PUBLIC_AUTH0_DOMAIN production
npx vercel env add NEXT_PUBLIC_AUTH0_AUDIENCE production
npx vercel env add NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID production
# KV_REST_API_URL and KV_REST_API_TOKEN are set automatically by the Vercel KV integration

# Option B: Set all at once via Vercel Dashboard
# Project → Settings → Environment Variables

# 5. Deploy to production
npx vercel --prod
```

### Subsequent Deployments

```bash
# Push to the linked Git branch to trigger automatic deployment
git push origin main

# Or deploy manually
npx vercel --prod
```

### Local Development

```bash
# Pull environment variables to .env.local
npx vercel env pull .env.local

# Start the development server
npm run dev
# Server runs at http://localhost:3000
```

> **Warning:** `.env.local` contains real secrets. Ensure it is listed in `.gitignore` (it is, by default in the repository).

### Rotating Secrets

If `CREDENTIAL_ENCRYPTION_KEY` is rotated, all existing encrypted credentials in Redis become unreadable. Before rotating:
1. Notify users that they will need to re-enter their Mapp credentials
2. Optionally flush the Redis keyspace (`mapp_creds:*`) after rotation
3. Set the new key in Vercel and redeploy

If `AUTH0_ACTION_SECRET` is rotated, the value must be updated in both:
- Vercel environment (`AUTH0_ACTION_SECRET`)
- Auth0 Action secrets (`SESSION_TOKEN_SECRET` in the Post-Login Action)

---

## Post-Deploy Verification

### 1. Health Check

```bash
curl https://<your-deployment-domain>/api/health
```

Expected response (HTTP 200):

```json
{
  "status": "ok",
  "timestamp": "2026-02-26T15:00:00.000Z"
}
```

HTTP 503 indicates one or more environment variables are missing. Missing keys are logged server-side.

### 2. OAuth Metadata

```bash
curl https://<your-deployment-domain>/.well-known/oauth-protected-resource
```

Expected response:

```json
{
  "resource": "https://<your-deployment-domain>",
  "authorization_servers": ["https://<your-auth0-domain>"]
}
```

### 3. MCP Endpoint Authentication

```bash
# Without a token — should return 401
curl -X POST https://<your-deployment-domain>/api/mcp \
  -H "Content-Type: application/json"

# Response: HTTP 401 Unauthorized
```

```bash
# ChatGPT-focused endpoint (also should return 401 without token)
curl -X POST https://<your-deployment-domain>/api/mcp-chatgpt \
  -H "Content-Type: application/json"

# Response: HTTP 401 Unauthorized
```

### 4. Settings Page

Visit `https://<your-deployment-domain>/settings` in a browser. You should be redirected to the Auth0 Universal Login page.

---

## Monitoring & Observability

### Vercel Function Logs

All runtime logs are available in the Vercel dashboard under **Project → Logs**. In production, verbose MCP logs are disabled (`verboseLogs: process.env.NODE_ENV !== "production"`). Errors from JWT verification, Redis operations, and Mapp API failures are logged with `console.error`.

### Health Endpoint

The `/api/health` endpoint is suitable for uptime monitors (e.g. Vercel Monitoring, Datadog, UptimeRobot). It checks configuration presence and returns only `status` and `timestamp`; missing keys are logged server-side.

### Key Metrics to Watch

| Metric | Where to find | Notes |
|---|---|---|
| Function invocations | Vercel dashboard → Analytics | Baseline for usage |
| Function errors | Vercel dashboard → Logs | Filter by `error` level |
| Function duration | Vercel dashboard → Analytics | Watch for `api/mcp` approaching 120s |
| Redis usage | Upstash console | Monitor reads/writes and storage |
| Auth0 logins | Auth0 dashboard → Logs | Failed logins indicate credential issues |
