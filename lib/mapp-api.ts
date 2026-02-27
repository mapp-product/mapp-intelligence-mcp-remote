/**
 * Mapp Intelligence Analytics API client.
 *
 * Ported from the original local MCP server (mapp-intelligence-mcp).
 * This version accepts per-request credentials instead of using env vars,
 * enabling multi-tenant usage with per-user Mapp accounts.
 */

import { createHash } from "node:crypto";
import { assertTrustedMappAbsoluteUrl, getMappApiBaseUrl } from "./mapp-base-url";

const TOKEN_REFRESH_SAFETY_MS = 60_000;
const MAX_TOKEN_CACHE_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Token cache — keyed by credentials tuple hash for tenant-safe reuse
// ---------------------------------------------------------------------------

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export interface MappCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

function getTokenCacheKey(creds: MappCredentials): string {
  return createHash("sha256")
    .update(`${creds.clientId}\n${creds.clientSecret}\n${getMappApiBaseUrl()}`)
    .digest("hex");
}

function pruneExpiredTokenCache(now = Date.now()): void {
  for (const [key, entry] of tokenCache.entries()) {
    if (now >= entry.expiresAt) {
      tokenCache.delete(key);
    }
  }
}

function enforceTokenCacheLimit(): void {
  if (tokenCache.size <= MAX_TOKEN_CACHE_ENTRIES) return;

  const sortedByExpiry = [...tokenCache.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );
  const removeCount = tokenCache.size - MAX_TOKEN_CACHE_ENTRIES;
  for (let i = 0; i < removeCount; i++) {
    tokenCache.delete(sortedByExpiry[i][0]);
  }
}

async function getToken(creds: MappCredentials): Promise<string> {
  const now = Date.now();
  pruneExpiredTokenCache(now);

  const cacheKey = getTokenCacheKey(creds);
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt - TOKEN_REFRESH_SAFETY_MS) {
    return cached.token;
  }

  const baseUrl = getMappApiBaseUrl();
  const url = new URL("/analytics/api/oauth/token", baseUrl);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("scope", "mapp.intelligence-api");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
          "base64"
        ),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mapp authentication failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const expiresInSeconds =
    typeof data.expires_in === "number" ? data.expires_in : 3600;

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  });
  enforceTokenCacheLimit();

  return data.access_token;
}

// ---------------------------------------------------------------------------
// HTTP helpers — identical logic to the original, but accept credentials
// ---------------------------------------------------------------------------

export async function apiGet(
  creds: MappCredentials,
  path: string,
  params: Record<string, string | number | undefined | null> = {}
) {
  const token = await getToken(creds);
  const url = new URL(path, getMappApiBaseUrl());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function apiPost(
  creds: MappCredentials,
  path: string,
  body: unknown
) {
  const token = await getToken(creds);
  const url = new URL(path, getMappApiBaseUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function apiDelete(creds: MappCredentials, path: string) {
  const token = await getToken(creds);
  const url = new URL(path, getMappApiBaseUrl());
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${path} failed (${res.status}): ${text}`);
  }
  return { success: true, status: res.status };
}

export async function apiGetAbsolute(
  creds: MappCredentials,
  absoluteUrl: string
) {
  assertTrustedMappAbsoluteUrl(absoluteUrl);

  const token = await getToken(creds);
  const res = await fetch(absoluteUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${absoluteUrl} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Polling helper — waits for an analysis query to complete
// ---------------------------------------------------------------------------

export async function pollForResult(
  creds: MappCredentials,
  statusUrl: string,
  maxAttempts = 30,
  intervalMs = 2000
) {
  assertTrustedMappAbsoluteUrl(statusUrl);

  for (let i = 0; i < maxAttempts; i++) {
    const status = await apiGetAbsolute(creds, statusUrl);

    if (status.resultUrl) {
      return status;
    }

    if (status.status === "FAILED" || status.status === "ERROR") {
      throw new Error(`Query failed: ${JSON.stringify(status)}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Query did not complete after ${maxAttempts} polling attempts`
  );
}

