/**
 * Setup API — credential storage during Auth0 redirect flow.
 *
 * This endpoint is called by the /setup page during the Auth0 post-login
 * redirect. It receives the session_token (signed by the Auth0 Action)
 * and the user's Mapp credentials. It verifies the session token using
 * the shared secret, stores the credentials, and returns success.
 *
 * Unlike /api/settings (which uses a standard Bearer JWT), this endpoint
 * validates the session_token issued by the Auth0 Action redirect flow.
 */

import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { saveCredentials } from "@/lib/credential-store";
import { validateSubmittedBaseUrl } from "@/lib/mapp-base-url";

/**
 * POST /api/setup — Save credentials during Auth0 redirect onboarding.
 *
 * Body: { session_token: string, clientId: string, clientSecret: string, baseUrl?: string }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AUTH0_ACTION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured: AUTH0_ACTION_SECRET not set" },
      { status: 500 }
    );
  }

  let body: {
    session_token?: string;
    clientId?: string;
    clientSecret?: string;
    baseUrl?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.session_token) {
    return NextResponse.json(
      { error: "session_token is required" },
      { status: 400 }
    );
  }

  if (!body.clientId || !body.clientSecret) {
    return NextResponse.json(
      { error: "clientId and clientSecret are required" },
      { status: 400 }
    );
  }

  const baseUrlError = validateSubmittedBaseUrl(body.baseUrl);
  if (baseUrlError) {
    return NextResponse.json({ error: baseUrlError }, { status: 400 });
  }

  // Verify the session token signed by the Auth0 Action
  let payload: jose.JWTPayload;
  try {
    const secretKey = new TextEncoder().encode(secret);
    const result = await jose.jwtVerify(body.session_token, secretKey, {
      algorithms: ["HS256"],
    });
    payload = result.payload;
  } catch (err) {
    console.error("Session token verification failed:", err);
    return NextResponse.json(
      { error: "Invalid or expired session token" },
      { status: 401 }
    );
  }

  const sub = payload.sub;
  if (!sub) {
    return NextResponse.json(
      { error: "Session token missing sub claim" },
      { status: 401 }
    );
  }

  // Store the credentials
  await saveCredentials(sub, {
    clientId: body.clientId,
    clientSecret: body.clientSecret,
  });

  return NextResponse.json({
    success: true,
    message: "Mapp credentials saved successfully",
  });
}
