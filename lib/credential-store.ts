/**
 * Per-user Mapp credential store backed by Upstash Redis.
 *
 * Credentials are encrypted at rest using AES-256-GCM.
 * Keys are namespaced by the OAuth subject (`sub`) claim.
 */

import { Redis } from "@upstash/redis";
import { encrypt, decrypt } from "./crypto";
import type { MappCredentials } from "./mapp-api";
import { getMappApiBaseUrl } from "./mapp-base-url";

const KEY_PREFIX = "mapp_creds:";

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Redis not configured: set KV_REST_API_URL and KV_REST_API_TOKEN");
  }
  return new Redis({ url, token });
}

export interface StoredCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export async function saveCredentials(
  sub: string,
  creds: StoredCredentials
): Promise<void> {
  const redis = getRedis();
  const payload = JSON.stringify({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  });
  const encrypted = await encrypt(payload);
  await redis.set(`${KEY_PREFIX}${sub}`, encrypted);
}

export async function loadCredentials(
  sub: string
): Promise<MappCredentials | null> {
  const redis = getRedis();
  const encrypted = await redis.get<string>(`${KEY_PREFIX}${sub}`);
  if (!encrypted) return null;

  try {
    const json = await decrypt(encrypted);
    const parsed = JSON.parse(json) as StoredCredentials;
    if (
      typeof parsed.clientId !== "string" ||
      typeof parsed.clientSecret !== "string"
    ) {
      return null;
    }

    return {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      // Keep baseUrl in memory for compatibility with existing response shapes.
      // Runtime API calls ignore user-provided origins and use configured base URL.
      baseUrl: getMappApiBaseUrl(),
    };
  } catch {
    return null;
  }
}

export async function deleteCredentials(sub: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${KEY_PREFIX}${sub}`);
}

export async function hasCredentials(sub: string): Promise<boolean> {
  const redis = getRedis();
  const exists = await redis.exists(`${KEY_PREFIX}${sub}`);
  return exists === 1;
}
