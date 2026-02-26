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

## License

MIT
