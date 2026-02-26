/**
 * Settings API — per-user Mapp credential management.
 *
 * Authenticated users can save, retrieve (masked), and delete their
 * Mapp Intelligence API credentials via this endpoint.
 *
 * Protected by Auth0 JWT — the `sub` claim identifies the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth0Token } from "@/lib/auth";
import {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  hasCredentials,
} from "@/lib/credential-store";

/**
 * Extract and verify the bearer token from the Authorization header.
 */
async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const token = authHeader.substring(7);
  const payload = await verifyAuth0Token(token);

  if (!payload) {
    return { error: "Invalid or expired token", status: 401 };
  }

  return { sub: payload.sub };
}

/**
 * GET /api/settings — Check if credentials are configured (does not return secrets).
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const exists = await hasCredentials(auth.sub);

  if (exists) {
    const creds = await loadCredentials(auth.sub);
    return NextResponse.json({
      configured: true,
      clientId: creds ? maskString(creds.clientId) : "****",
      baseUrl: creds?.baseUrl || "https://intelligence.eu.mapp.com",
    });
  }

  return NextResponse.json({ configured: false });
}

/**
 * POST /api/settings — Save Mapp credentials.
 *
 * Body: { clientId: string, clientSecret: string, baseUrl?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: {
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

  if (!body.clientId || !body.clientSecret) {
    return NextResponse.json(
      { error: "clientId and clientSecret are required" },
      { status: 400 }
    );
  }

  await saveCredentials(auth.sub, {
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    baseUrl: body.baseUrl || "https://intelligence.eu.mapp.com",
  });

  return NextResponse.json({
    success: true,
    message: "Mapp credentials saved successfully",
    clientId: maskString(body.clientId),
  });
}

/**
 * DELETE /api/settings — Remove stored credentials.
 */
export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  await deleteCredentials(auth.sub);

  return NextResponse.json({
    success: true,
    message: "Mapp credentials deleted",
  });
}

/**
 * Mask a string, showing only first 3 and last 2 characters.
 */
function maskString(s: string): string {
  if (s.length <= 5) return "****";
  return s.substring(0, 3) + "****" + s.substring(s.length - 2);
}
