import { createHash, randomBytes } from "node:crypto";

export const SETTINGS_OAUTH_STATE_COOKIE = "mapp_settings_oauth_state";
export const SETTINGS_OAUTH_PKCE_COOKIE = "mapp_settings_oauth_pkce";
export const SETTINGS_OAUTH_MAX_AGE_SECONDS = 600;

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createOauthState(): string {
  return toBase64Url(randomBytes(32));
}

export function createPkceVerifier(): string {
  return toBase64Url(randomBytes(64));
}

export function createPkceChallenge(verifier: string): string {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

