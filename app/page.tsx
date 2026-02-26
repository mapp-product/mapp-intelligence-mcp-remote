/**
 * Root page — landing page with links to settings and documentation.
 */

export default function Home() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Mapp Intelligence MCP Server</h1>
      <p>
        Remote MCP server for the Mapp Intelligence Analytics API,
        secured with Auth0 OAuth 2.0.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/mcp</code> — MCP endpoint (Streamable HTTP)</li>
        <li><code>/api/settings</code> — Credential management API (JWT-protected)</li>
        <li><code>/api/health</code> — Health check</li>
        <li><code>/.well-known/oauth-protected-resource</code> — OAuth metadata</li>
      </ul>
      <h2>Getting Started</h2>
      <ol>
        <li>Connect your MCP client (e.g. Claude, Cursor) to <code>/api/mcp</code></li>
        <li>Authenticate via Auth0 OAuth</li>
        <li>You&apos;ll be prompted to enter your Mapp Intelligence credentials on first login</li>
        <li>Start querying your analytics data</li>
      </ol>
      <h2>Manage Credentials</h2>
      <p>
        Need to update your API credentials?{" "}
        <a href="/settings" style={{ color: "#0052FF" }}>
          Open Settings
        </a>
      </p>
    </div>
  );
}
