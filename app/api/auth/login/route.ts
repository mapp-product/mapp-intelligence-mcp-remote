import { NextRequest, NextResponse } from "next/server";
import {
  SETTINGS_OAUTH_MAX_AGE_SECONDS,
  SETTINGS_OAUTH_PKCE_COOKIE,
  SETTINGS_OAUTH_STATE_COOKIE,
  createOauthState,
  createPkceChallenge,
  createPkceVerifier,
} from "@/lib/settings-oauth";

const CALLBACK_PATH = "/api/auth/callback";

function useSecureCookies(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:";
}

export async function GET(req: NextRequest) {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  const settingsClientId = process.env.AUTH0_SETTINGS_CLIENT_ID;

  if (!domain || !audience || !settingsClientId) {
    return NextResponse.json(
      { error: "Auth configuration incomplete for settings page" },
      { status: 500 }
    );
  }

  const state = createOauthState();
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);
  const callbackUrl = `${req.nextUrl.origin}${CALLBACK_PATH}`;

  const authUrl = new URL(`https://${domain}/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", settingsClientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("audience", audience);
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: useSecureCookies(req),
    sameSite: "lax" as const,
    path: CALLBACK_PATH,
    maxAge: SETTINGS_OAUTH_MAX_AGE_SECONDS,
  };

  response.cookies.set(SETTINGS_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(
    SETTINGS_OAUTH_PKCE_COOKIE,
    codeVerifier,
    cookieOptions
  );

  return response;
}

