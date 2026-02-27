# Security Audit Report: mapp-intelligence-mcp-remote

Date: 2026-02-26  
Auditor: Codex (GPT-5)

## Executive Summary

This audit covered source code, dependencies, and live platform configuration on Vercel/Auth0.

- Findings identified: **8**
- Current status after remediation in this change set:
  - **8 resolved**
  - **0 open**

High-risk areas were OAuth callback integrity, outbound URL trust boundaries, and an MCP dependency advisory. All were remediated and re-verified.

## Scope and Methodology

### Repository analysis

- Manual review: `app/api/**`, `app/settings/page.tsx`, `app/setup/page.tsx`, `lib/**`, `auth0-action.js`
- Static scans:
  - `rg -n --hidden --glob '!.git/*' 'BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}'`
  - `rg -n --hidden --glob '!.git/*' '(eval\\(|new Function\\(|child_process|exec\\(|dangerouslySetInnerHTML)'`
- Dependency analysis:
  - `npm ls @modelcontextprotocol/sdk mcp-handler`
  - `npm audit --omit=dev --json`

### Platform analysis (live CLI)

- Vercel:
  - `vercel project inspect mapp-intelligence-mcp-remote`
  - `vercel env list production`
  - `vercel env list preview`
  - `vercel env list development`
- Auth0:
  - `auth0 tenant-settings show --json`
  - `auth0 apps show zk99QhX2rRo5H9hkXcvh4ZcLHcccOf33 --json`
  - `auth0 apis show https://mapp-intelligence-mcp.vercel.app/api/mcp --json`
  - `auth0 actions list --json`

## Platform Configuration Inventory

### Vercel

| Property | Value |
|---|---|
| Project | `mapp-intelligence-mcp-remote` |
| Owner Scope | `michaels-projects-3449ce57` |
| Node version | `24.x` |
| Framework | Next.js |

Environment variable presence:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `MAPP_API_BASE_URL` | ✓ | ✓ | ✓ |
| `AUTH0_DOMAIN` | ✓ | ✓ | — |
| `AUTH0_AUDIENCE` | ✓ | ✓ | — |
| `AUTH0_ACTION_SECRET` | ✓ | ✓ | — |
| `AUTH0_SETTINGS_CLIENT_ID` | ✓ | ✓ | — |
| `AUTH0_SETTINGS_CLIENT_SECRET` | ✓ | ✓ | — |
| `CREDENTIAL_ENCRYPTION_KEY` | ✓ | ✓ | — |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | ✓ | ✓ | — |
| `NEXT_PUBLIC_AUTH0_AUDIENCE` | ✓ | ✓ | — |
| `NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID` | ✓ | ✓ | — |
| `KV_REST_API_URL` | ✓ | ✓ | ✓ |
| `KV_REST_API_TOKEN` | ✓ | ✓ | ✓ |

Note: secret values were not exported in this report; only presence/state was reviewed.

### Auth0

| Property | Value |
|---|---|
| Tenant | `mapp-product.eu.auth0.com` |
| Default audience | `https://mapp-intelligence-mcp.vercel.app/api/mcp` |
| Dynamic client registration | Enabled |
| MCP API identifier | `https://mapp-intelligence-mcp.vercel.app/api/mcp` |
| MCP API signing algorithm | `RS256` |
| Settings app client ID | `zk99QhX2rRo5H9hkXcvh4ZcLHcccOf33` |
| Settings app callback | `https://mapp-intelligence-mcp-remote.vercel.app/api/auth/callback` |
| Settings app grant types | `authorization_code` |
| Post-login Action | `Mapp Credential Onboarding` |
| Post-login Action runtime | `node22` |
| Post-login Action deployed | `true` |
| Post-login Action secrets present | `SETUP_URL`, `SESSION_TOKEN_SECRET`, `AUTH0_DOMAIN` |

## Findings and Remediation Status

### 1) High: OAuth settings flow lacked callback integrity checks

- Risk: login CSRF / authorization response injection.
- Evidence (pre-fix): callback read `state` without validation; no PKCE verifier exchange.
- Remediation:
  - Added `GET /api/auth/login` to create `state` + PKCE and set HttpOnly cookies.
  - Updated callback to validate `state`, require PKCE verifier, and clear temp cookies.
- Status: **Resolved**.

### 2) High: User-controlled `baseUrl` enabled SSRF and credential exfil path

- Risk: outbound Basic-auth token request could be redirected to attacker-controlled origin.
- Evidence (pre-fix): `baseUrl` persisted and used to construct downstream OAuth/token URLs.
- Remediation:
  - Pinned downstream endpoint to `MAPP_API_BASE_URL` with required value `https://intelligence.eu.mapp.com`.
  - Settings/setup now reject non-EU `baseUrl` if provided.
  - UI no longer allows editing base URL.
- Status: **Resolved**.

### 3) High: MCP dependency advisory (`GHSA-345p-7cg4-v4c7`)

- Risk: cross-client data leak in vulnerable SDK versions.
- Evidence (pre-fix): transitive `@modelcontextprotocol/sdk` in vulnerable range.
- Remediation:
  - Added `overrides` to force `@modelcontextprotocol/sdk@^1.27.1`.
  - Added committed lockfile and re-ran audit.
- Verification:
  - `npm ls` resolves `@modelcontextprotocol/sdk@1.27.1`.
  - `npm audit --omit=dev` reports 0 vulnerabilities.
- Status: **Resolved**.

### 4) Medium: Untrusted absolute URLs were fetched with bearer tokens

- Risk: token forwarding to attacker hosts via untrusted `statusUrl`/`resultUrl`.
- Evidence (pre-fix): `apiGetAbsolute()` accepted arbitrary absolute URLs.
- Remediation:
  - Added strict origin validation against `https://intelligence.eu.mapp.com`.
  - Added explicit URL trust checks in tool flow before fetches.
- Status: **Resolved**.

### 5) Medium: Token cache key was too coarse (`clientId` only)

- Risk: cache collisions across tenants sharing `clientId`.
- Evidence (pre-fix): cache map keyed only by `clientId`.
- Remediation:
  - Cache key now derived from `(clientId, clientSecret, base URL)` hash.
  - Added expired-entry pruning and cache size cap.
- Status: **Resolved**.

### 6) Low: Health endpoint leaked configuration posture

- Risk: unauthenticated reconnaissance of missing config classes.
- Evidence (pre-fix): endpoint returned per-variable readiness fields.
- Remediation:
  - Health response minimized to `{ status, timestamp }`.
  - Missing key details moved to server logs only.
- Status: **Resolved**.

### 7) Medium: Auth0 settings app had unnecessary refresh-token grant

- Risk: unnecessary long-lived token capability with no product need.
- Evidence (pre-fix): app grant types included refresh-token.
- Remediation:
  - Updated Auth0 app grant types to `authorization_code` only.
- Status: **Resolved**.

### 8) Low: Preview environment drift in critical auth/encryption vars

- Risk: inconsistent security posture and broken preview behavior.
- Evidence (pre-fix): Preview lacked `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `CREDENTIAL_ENCRYPTION_KEY`.
- Remediation:
  - Added missing vars to Preview.
  - Added `MAPP_API_BASE_URL` to Production/Preview/Development.
- Status: **Resolved**.

## Verification Results

- Build: `npm run build` succeeded.
- Dependency audit: `npm audit --omit=dev --json` returned 0 vulnerabilities.
- Resolved SDK chain:
  - `mcp-handler@1.0.7`
  - `@modelcontextprotocol/sdk@1.27.1` (overridden).
- Auth0 checks:
  - Settings app grant types now `authorization_code`.
  - MCP API still `RS256`.
  - Post-login action remains deployed with required secrets.
- Vercel checks:
  - `MAPP_API_BASE_URL` present in all environments.
  - Preview now includes required auth/encryption variables.

## Notes

- Optional KV aliases `KV_URL` and `REDIS_URL` were removed from Vercel; application code uses `KV_REST_API_*` (or `UPSTASH_REDIS_REST_*` fallback) only.
- If additional regional Mapp endpoints are needed in future, URL trust policy and validation logic must be intentionally expanded.
