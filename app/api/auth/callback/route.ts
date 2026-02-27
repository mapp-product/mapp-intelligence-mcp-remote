/**
 * Auth callback API — handles OAuth code exchange for the /settings page.
 *
 * The companion /api/auth/login route sets short-lived state and PKCE
 * verifier cookies. This callback validates those values before exchanging
 * the code for an access token, then redirects to /settings with the token
 * in a URL fragment.
 *
 * Using fragment (hash) rather than query params keeps the token out of
 * server logs on subsequent page requests.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SETTINGS_OAUTH_PKCE_COOKIE,
  SETTINGS_OAUTH_STATE_COOKIE,
} from "@/lib/settings-oauth";

const CALLBACK_PATH = "/api/auth/callback";

function clearOauthCookies(response: NextResponse): void {
  response.cookies.set(SETTINGS_OAUTH_STATE_COOKIE, "", {
    path: CALLBACK_PATH,
    maxAge: 0,
  });
  response.cookies.set(SETTINGS_OAUTH_PKCE_COOKIE, "", {
    path: CALLBACK_PATH,
    maxAge: 0,
  });
}

function redirectWithError(req: NextRequest, message: string): NextResponse {
  const redirectUrl = new URL("/settings", req.nextUrl.origin);
  redirectUrl.hash = `error=${encodeURIComponent(message)}`;
  const response = NextResponse.redirect(redirectUrl);
  clearOauthCookies(response);
  return response;
}

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
  const callbackState = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const expectedState = req.cookies.get(SETTINGS_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = req.cookies.get(SETTINGS_OAUTH_PKCE_COOKIE)?.value;

  if (error) {
    const errorDescription =
      req.nextUrl.searchParams.get("error_description") || "Login failed";
    return redirectWithError(req, errorDescription);
  }

  if (!code) {
    return redirectWithError(req, "Missing authorization code");
  }

  if (!callbackState || !expectedState || callbackState !== expectedState) {
    return redirectWithError(req, "Invalid authentication state");
  }

  if (!codeVerifier) {
    return redirectWithError(req, "Missing PKCE verifier");
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
        audience,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      return redirectWithError(req, "Token exchange failed");
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;

    // Redirect to settings page with the token in the fragment
    const redirectUrl = new URL("/settings", req.nextUrl.origin);
    redirectUrl.hash = `access_token=${accessToken}`;
    const response = NextResponse.redirect(redirectUrl);
    clearOauthCookies(response);
    return response;
  } catch (err) {
    console.error("Auth callback error:", err);
    return redirectWithError(req, "Authentication failed");
  }
}
