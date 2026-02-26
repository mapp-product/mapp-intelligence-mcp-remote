/**
 * Health / readiness endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    auth0Domain: process.env.AUTH0_DOMAIN ? "configured" : "missing",
    auth0Audience: process.env.AUTH0_AUDIENCE ? "configured" : "missing",
    encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ? "configured" : "missing",
    redisUrl: process.env.UPSTASH_REDIS_REST_URL ? "configured" : "missing",
  };

  const allConfigured = Object.values(checks).every(
    (v) => v !== "missing"
  );

  return NextResponse.json(checks, {
    status: allConfigured ? 200 : 503,
  });
}
