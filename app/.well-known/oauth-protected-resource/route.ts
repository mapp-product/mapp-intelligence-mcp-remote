/**
 * OAuth Protected Resource Metadata endpoint.
 *
 * Per the MCP OAuth spec, this tells clients where the authorization
 * server is so they can initiate the OAuth flow.
 */

import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || "").trim();

const handler = protectedResourceHandler({
  authServerUrls: [`https://${AUTH0_DOMAIN}`],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
