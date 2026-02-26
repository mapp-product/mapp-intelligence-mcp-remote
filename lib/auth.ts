/**
 * Auth0 JWT verification for MCP server requests.
 *
 * Validates access tokens issued by Auth0 using JWKS (RS256).
 * Returns the decoded token payload including the `sub` claim
 * used to key per-user credential storage.
 */

import * as jose from "jose";

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    const domain = process.env.AUTH0_DOMAIN;
    if (!domain) throw new Error("AUTH0_DOMAIN is not configured");
    jwks = jose.createRemoteJWKSet(
      new URL(`https://${domain}/.well-known/jwks.json`)
    );
  }
  return jwks;
}

export interface TokenPayload {
  sub: string;
  aud: string | string[];
  iss: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Verify an Auth0 JWT access token.
 * Returns the payload if valid, or null if verification fails.
 */
export async function verifyAuth0Token(
  token: string
): Promise<TokenPayload | null> {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;

  if (!domain || !audience) {
    console.error("AUTH0_DOMAIN and AUTH0_AUDIENCE must be configured");
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(token, getJWKS(), {
      issuer: `https://${domain}/`,
      audience: audience,
    });

    if (!payload.sub) {
      console.error("Token missing sub claim");
      return null;
    }

    return payload as unknown as TokenPayload;
  } catch (err) {
    console.error("JWT verification failed:", err);
    return null;
  }
}
