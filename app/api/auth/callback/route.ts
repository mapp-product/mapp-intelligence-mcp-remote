/**
 * Auth callback API — handles OAuth code exchange for the /settings page.
 *
 * When a user visits /settings, they are redirected to Auth0 to log in.
 * Auth0 redirects back to /api/auth/callback with an authorization code.
 * This endpoint exchanges the code for an access token and redirects
 * the user to /settings with the token in a fragment (hash).
 *
 * Using fragment (hash) rather than query params ensures the token
 * is not sent to the server on subsequent requests.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  const settingsClientId = process.env.AUTH0_SETTINGS_CLIENT_ID;
  const settingsClientSecret = process.env.AUTH0_SETTINGS_CLIENT_SECRET;

  if (!domain || !audience || !settingsClientId || !settingsClientSecret) {
    return NextResponse.json(
      { error: "Auth configuration incomplete for settings page" },
      { status: 500 }
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    const errorDescription = req.nextUrl.searchParams.get("error_description") || "Login failed";
    const redirectUrl = new URL("/settings", req.nextUrl.origin);
    redirectUrl.hash = `error=${encodeURIComponent(errorDescription)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  // Exchange authorization code for tokens
  const tokenUrl = `https://${domain}/oauth/token`;
  const callbackUrl = `${req.nextUrl.origin}/api/auth/callback`;

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: settingsClientId,
        client_secret: settingsClientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      const redirectUrl = new URL("/settings", req.nextUrl.origin);
      redirectUrl.hash = "error=Token+exchange+failed";
      return NextResponse.redirect(redirectUrl);
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;

    // Redirect to settings page with the token in the fragment
    const redirectUrl = new URL("/settings", req.nextUrl.origin);
    redirectUrl.hash = `access_token=${accessToken}`;
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Auth callback error:", err);
    const redirectUrl = new URL("/settings", req.nextUrl.origin);
    redirectUrl.hash = "error=Authentication+failed";
    return NextResponse.redirect(redirectUrl);
  }
}
