/**
 * Root page — redirect to health endpoint or show basic info.
 */

export default function Home() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "600px" }}>
      <h1>Mapp Intelligence MCP Server</h1>
      <p>
        Remote MCP server for the Mapp Intelligence Analytics API,
        secured with Auth0 OAuth 2.0.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/mcp</code> — MCP endpoint (Streamable HTTP)</li>
        <li><code>/api/settings</code> — Credential management (JWT-protected)</li>
        <li><code>/api/health</code> — Health check</li>
        <li><code>/.well-known/oauth-protected-resource</code> — OAuth metadata</li>
      </ul>
      <h2>Getting Started</h2>
      <ol>
        <li>Connect your MCP client (e.g. Claude) to <code>/api/mcp</code></li>
        <li>Authenticate via Auth0 OAuth</li>
        <li>Save your Mapp Intelligence credentials via <code>/api/settings</code></li>
        <li>Start querying your analytics data</li>
      </ol>
    </div>
  );
}
