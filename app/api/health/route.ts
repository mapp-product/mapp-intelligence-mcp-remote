/**
 * Health / readiness endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const missing: string[] = [];
  if (!process.env.AUTH0_DOMAIN) missing.push("AUTH0_DOMAIN");
  if (!process.env.AUTH0_AUDIENCE) missing.push("AUTH0_AUDIENCE");
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    missing.push("CREDENTIAL_ENCRYPTION_KEY");
  }
  if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)) {
    missing.push("KV_REST_API_URL");
  }
  if (!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)) {
    missing.push("KV_REST_API_TOKEN");
  }

  const status = missing.length === 0 ? "ok" : "degraded";
  if (missing.length > 0) {
    console.error("Health check missing required configuration:", missing);
  }

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
    },
    { status: missing.length === 0 ? 200 : 503 }
  );
}
