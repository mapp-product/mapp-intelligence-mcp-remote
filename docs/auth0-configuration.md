# Auth0 Setup & Configuration

This document describes the complete Auth0 tenant configuration for the Mapp Intelligence MCP Remote Server.

---

## Table of Contents

1. [Tenant](#tenant)
2. [API (Resource Server)](#api-resource-server)
3. [Applications](#applications)
4. [Database Connection](#database-connection)
5. [Post-Login Action: Mapp Credential Onboarding](#post-login-action-mapp-credential-onboarding)
6. [Authentication Flows](#authentication-flows)
   - [Flow 1: MCP Client OAuth (Dynamic Client Registration)](#flow-1-mcp-client-oauth-dynamic-client-registration)
   - [Flow 2: Settings Page Login (Regular Web App)](#flow-2-settings-page-login-regular-web-app)
7. [OAuth Metadata Endpoint](#oauth-metadata-endpoint)

---

## Tenant

| Property | Value |
|---|---|
| Domain | `mapp-product.eu.auth0.com` |
| Region | EU |
| Default Audience | `https://mapp-intelligence-mcp.vercel.app/api/mcp` |

Setting the **default audience** at the tenant level ensures that tokens issued by any client automatically target the Mapp MCP API resource server, without requiring clients to explicitly pass an `audience` parameter.

---

## API (Resource Server)

| Property | Value |
|---|---|
| Name | Mapp Intelligence MCP |
| Identifier / Audience | `https://mapp-intelligence-mcp.vercel.app/api/mcp` |
| Signing Algorithm | RS256 |

The identifier is used as the `aud` claim in issued JWTs. The application verifies this value against the `AUTH0_AUDIENCE` environment variable on every request.

RS256 is used rather than HS256 because RS256 allows the server to verify tokens using the public key fetched from the JWKS endpoint, without requiring the application to hold the signing secret. This enables key rotation at the Auth0 level without application redeployment.

---

## Applications

### 1. Dynamic Client Registration

**Type:** Enabled at the tenant level

MCP clients (Claude Desktop, Cursor, and any other MCP-capable tool) can register themselves dynamically when they first connect to the server. They do not require pre-shared `client_id`/`client_secret` values.

The flow works as follows:
1. The MCP client discovers the Auth0 authorization server URL from `/.well-known/oauth-protected-resource`
2. The client POSTs to Auth0's Dynamic Client Registration endpoint to obtain a `client_id`
3. The client uses that `client_id` to initiate the standard OAuth authorization code flow

Dynamic client registration is the correct approach for MCP servers because the set of clients is open-ended — any MCP tool should be able to connect without an admin pre-registering it.

### 2. Mapp MCP Settings (Regular Web Application)

This application is used exclusively by the `/settings` page to provide a conventional web-app OAuth login flow.

| Property | Value |
|---|---|
| Client ID | `zk99QhX2rRo5H9hkXcvh4ZcLHcccOf33` |
| Type | Regular Web Application |
| OIDC Conformant | Yes |
| Allowed Callback URLs | `https://mapp-intelligence-mcp-remote.vercel.app/api/auth/callback` |
| Grant types | Authorization Code only |

The settings page needs a stable `client_id` and server-side `client_secret` to perform the authorization code exchange at `/api/auth/callback`. Unlike dynamic MCP clients, this is a first-party application with a known callback URL.

---

## Database Connection

| Property | Value |
|---|---|
| Type | Database (Username-Password-Authentication) |
| Connection ID | `con_jT0vvl4nrbq2VTui` |
| Domain aliases | `["mapp.com"]` |
| Password policy | `good` |
| Brute force protection | Enabled |

The `domain_aliases` setting restricts sign-up to `@mapp.com` email addresses at the Auth0 connection level. This is a first line of defence, with a second enforcement layer in the Post-Login Action (see below).

---

## Post-Login Action: Mapp Credential Onboarding

### Overview

| Property | Value |
|---|---|
| Action ID | `3251f9d0-f7b1-4b2c-91e8-99ddf640918f` |
| Trigger | Login flow (post-login) |
| Runtime | Node 22 |

This action fires after every successful Auth0 login. It has two responsibilities:

1. **Enforce domain restriction** — deny login if the user's email domain is not `mapp.com`
2. **Trigger onboarding** — if the user has never configured their Mapp credentials, redirect them to the setup page before completing login

### Action Secrets

| Secret | Purpose |
|---|---|
| `SETUP_URL` | URL of the `/setup` page (e.g. `https://mapp-intelligence-mcp-remote.vercel.app/setup`) |
| `SESSION_TOKEN_SECRET` | Shared HMAC secret for signing HS256 session tokens (must match `AUTH0_ACTION_SECRET` on the server) |
| `AUTH0_DOMAIN` | Auth0 domain — used for constructing the `/continue` redirect URL |

### Behavior

```
POST-LOGIN TRIGGER
│
├─ 1. Domain check
│      Extract email domain from event.user.email
│      If domain !== "mapp.com" → api.access.deny("Access restricted to @mapp.com emails")
│
├─ 2. Credentials configured check
│      If event.user.app_metadata.mapp_credentials_configured === true
│        → allow login (no redirect needed)
│
├─ 3. Redirect to setup (first-time users)
│      If api.redirect.canRedirect() === true
│        → Generate signed HS256 session token:
│            { sub, email, iss: AUTH0_DOMAIN, exp: now + 1h }
│        → api.redirect.sendUserTo(SETUP_URL + "?session_token=...")
│
└─ 4. onContinuePostLogin callback (after setup completes)
         api.user.setAppMetadata("mapp_credentials_configured", true)
         → Login continues normally
```

### Session Token

The session token is a short-lived HS256 JWT signed with `SESSION_TOKEN_SECRET`. It carries:

```json
{
  "sub": "<auth0_user_id>",
  "email": "<user@mapp.com>",
  "iss": "<AUTH0_DOMAIN>",
  "iat": <unix_timestamp>,
  "exp": <unix_timestamp + 3600>
}
```

The `/setup` page extracts the session token from the `?session_token=` query parameter and submits it to `POST /api/setup` along with the user's Mapp credentials. The server verifies the token's HMAC signature before storing the credentials.

After the user submits their credentials:
1. `/api/setup` saves the encrypted credentials to Redis
2. The setup page redirects the browser to `https://{AUTH0_DOMAIN}/continue` (the Auth0 post-redirect resume endpoint)
3. The Post-Login Action's `onContinuePostLogin` callback fires
4. The action sets `app_metadata.mapp_credentials_configured = true`
5. The original OAuth flow completes normally

### Full Action Source

The full source of the Auth0 action is available at `auth0-action.js` in the repository root.

---

## Authentication Flows

### Flow 1: MCP Client OAuth (Dynamic Client Registration)

This is the flow used when an MCP client (Claude, Cursor, etc.) connects for the first time.

```
 1. MCP Client → GET /.well-known/oauth-protected-resource
      Receives: { authorization_servers: ["https://mapp-product.eu.auth0.com"] }

 2. MCP Client → Auth0 Dynamic Client Registration
      POST https://mapp-product.eu.auth0.com/oidc/register
      Receives: { client_id, ... }

 3. MCP Client → Auth0 Authorization Endpoint
      GET https://mapp-product.eu.auth0.com/authorize
        ?client_id=<dynamic_client_id>
        &response_type=code
        &redirect_uri=<client_callback>
        &scope=openid profile email
        &audience=https://mapp-intelligence-mcp.vercel.app/api/mcp
        &code_challenge=<PKCE>
        &state=<random>

 4. User logs in via Auth0 Universal Login

 5. Post-Login Action fires:
      a. Domain check (@mapp.com enforcement)
      b. If first-time user:
           - Action generates session_token
           - Redirects to /setup?session_token=...
      c. User enters Mapp credentials on /setup page
      d. /setup page → POST /api/setup (saves encrypted creds to Redis)
      e. /setup page → browser redirect to https://mapp-product.eu.auth0.com/continue
      f. Action's onContinuePostLogin: sets app_metadata.mapp_credentials_configured = true
      g. If returning user (credentials already configured): skip b–f

 6. Auth0 → redirect to MCP client callback with authorization code

 7. MCP Client → Auth0 token endpoint
      POST https://mapp-product.eu.auth0.com/oauth/token
        grant_type=authorization_code
        code=<code>
        code_verifier=<PKCE verifier>
        client_id=<dynamic_client_id>
        redirect_uri=<client_callback>

 8. Auth0 returns access_token (RS256 JWT, aud = MCP API identifier)

 9. MCP Client → POST /api/mcp
      Authorization: Bearer <access_token>
      (All subsequent tool calls use this token)
```

### Flow 2: Settings Page Login (Regular Web App)

This flow is used when an existing user wants to update or delete their stored Mapp credentials via the `/settings` page.

```
 1. User visits /settings

 2. /settings page detects no token → redirects to /api/auth/login

 3. /api/auth/login generates OAuth state + PKCE verifier/challenge,
    sets short-lived HttpOnly cookies, and redirects to Auth0:
        GET https://mapp-product.eu.auth0.com/authorize
          ?client_id=zk99QhX2rRo5H9hkXcvh4ZcLHcccOf33
          &response_type=code
          &redirect_uri=https://mapp-intelligence-mcp-remote.vercel.app/api/auth/callback
          &scope=openid profile email
          &audience=https://mapp-intelligence-mcp.vercel.app/api/mcp
          &code_challenge=<S256 challenge>
          &code_challenge_method=S256
          &state=<random>

 4. User logs in (Post-Login Action runs, but user already has credentials configured
    so no redirect to /setup occurs)

 5. Auth0 → GET /api/auth/callback?code=<code>&state=<state>

 6. /api/auth/callback validates state + PKCE cookies, then exchanges code:
      POST https://mapp-product.eu.auth0.com/oauth/token
        grant_type=authorization_code
        client_id=zk99QhX2rRo5H9hkXcvh4ZcLHcccOf33
        client_secret=<AUTH0_SETTINGS_CLIENT_SECRET>
        code=<code>
        code_verifier=<pkce_verifier_from_cookie>
        redirect_uri=https://mapp-intelligence-mcp-remote.vercel.app/api/auth/callback
        audience=https://mapp-intelligence-mcp.vercel.app/api/mcp

 7. /api/auth/callback redirects to:
      /settings#access_token=<access_token>
      (token is in fragment, never sent to server in subsequent requests)

 8. /settings page reads token from window.location.hash, clears fragment

 9. /settings page calls /api/settings with:
      Authorization: Bearer <access_token>
      - GET  /api/settings        → check current credential status
      - POST /api/settings        → save new credentials
      - DELETE /api/settings      → remove credentials
```

**Why fragment delivery?** HTTP redirects with query parameters would include the access token in the `Referer` header on subsequent navigations and in server access logs. Fragments are never sent to the server by the browser, so the token stays client-side only.

---

## OAuth Metadata Endpoint

**File:** `app/.well-known/oauth-protected-resource/route.ts`

```typescript
const handler = protectedResourceHandler({
  authServerUrls: [`https://${AUTH0_DOMAIN}`],
});
export { handler as GET, corsHandler as OPTIONS };
```

The `/.well-known/oauth-protected-resource` endpoint returns a JSON document conforming to [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) (OAuth 2.0 Protected Resource Metadata). It tells MCP clients where to find the authorization server:

```json
{
  "resource": "https://mapp-intelligence-mcp-remote.vercel.app",
  "authorization_servers": [
    "https://mapp-product.eu.auth0.com"
  ]
}
```

MCP clients use this to discover the Auth0 authorization server before initiating Dynamic Client Registration or the authorization code flow. CORS `OPTIONS` handling is included via `metadataCorsOptionsRequestHandler` so browser-based clients can access the endpoint cross-origin.
