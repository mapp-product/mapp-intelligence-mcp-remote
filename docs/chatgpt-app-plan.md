# ChatGPT Analytics Endpoint Implementation & Deployment Runbook

This runbook documents the converged ChatGPT endpoint design and deployment checks.

## Scope

- Keep `/api/mcp` unchanged for existing Claude/Cursor clients.
- Keep `/api/mcp-chatgpt` as a ChatGPT-targeted endpoint.
- Use the same core 13-tool contract as `/api/mcp`.
- Add ChatGPT presentation semantics (`structuredContent`, widget templates, `_meta`) without changing core query behavior.

## Implemented Components

### API and tooling

- Generic endpoint: `app/api/mcp/route.ts`
- ChatGPT endpoint: `app/api/mcp-chatgpt/route.ts`
- ChatGPT compatibility endpoint: `app/api/mcp-chatgpt/mcp/route.ts`
- Shared tool definitions (single source of truth): `lib/unified-tool-definitions.ts`
- Generic registrar: `lib/tools.ts`
- ChatGPT thin adapter registrar: `lib/chatgpt-tools.ts`
- Tool error mapping helper: `lib/tool-error-mapping.ts`
- Widget HTML templates: `lib/chatgpt-widget-templates.ts`

### Docs

- Generic MCP tools: `docs/mcp-tools.md`
- ChatGPT endpoint contract: `docs/chatgpt-tools.md`
- Golden prompts: `docs/chatgpt-golden-prompts.md`
- This runbook: `docs/chatgpt-app-plan.md`

## Deployment Steps (Vercel)

1. Link project:

```bash
npx vercel link
```

2. Ensure storage is attached:
- Vercel Dashboard -> Project -> Storage -> Upstash Redis

3. Set env vars in both **Preview** and **Production**:

- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`
- `AUTH0_ACTION_SECRET`
- `AUTH0_SETTINGS_CLIENT_ID`
- `AUTH0_SETTINGS_CLIENT_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `MAPP_API_BASE_URL`
- `NEXT_PUBLIC_AUTH0_DOMAIN`
- `NEXT_PUBLIC_AUTH0_AUDIENCE`
- `NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

4. Deploy:

```bash
npx vercel --prod
```

5. Verify:

```bash
curl https://<deployment>/api/health
curl https://<deployment>/.well-known/oauth-protected-resource
curl -i -X POST https://<deployment>/api/mcp-chatgpt -H "Content-Type: application/json"
```

Expected:
- `api/health` returns `200` with `status: ok`
- OAuth metadata returns authorization server info
- Unauthorized `/api/mcp-chatgpt` returns OAuth challenge behavior (`401`)

## Auth0 Configuration Checklist

### Resource server
- API identifier (audience) matches `AUTH0_AUDIENCE`
- Signing algorithm: `RS256`

### Tenant settings
- Default audience set to MCP API identifier
- Dynamic client registration enabled

### Settings app
- Regular Web Application configured
- Callback URL includes `/api/auth/callback`
- Authorization Code flow enabled

### Connection and policy
- `@mapp.com` restrictions stay enabled for private beta

### Post-login action
- Deploy action from `auth0-action.js`
- Configure action secrets:
  - `SETUP_URL`
  - `SESSION_TOKEN_SECRET` (must equal `AUTH0_ACTION_SECRET`)
  - `AUTH0_DOMAIN`

## ChatGPT Connector Setup

1. In ChatGPT, enable Developer Mode.
2. Create a connector using:
- `https://<deployment>/api/mcp-chatgpt`
3. Complete OAuth linking.
4. Execute validation prompts from `docs/chatgpt-golden-prompts.md`.

## Acceptance Validation

- Existing `/api/mcp` tools still function unchanged.
- `/api/mcp-chatgpt` exposes the same 13 core tools as `/api/mcp`.
- ChatGPT responses include full JSON `content` plus structured envelope data.
- Widget resources resolve and render result cards.
- Build passes:

```bash
npm run build
```
