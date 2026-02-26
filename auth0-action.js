/**
 * Auth0 Post-Login Action: Mapp Credential Onboarding
 *
 * 1. Denies login to users whose email is not @mapp.com
 * 2. Redirects first-time users to the credential setup page
 *    so they can enter their Mapp Intelligence API credentials
 *    before completing the login flow.
 *
 * Once credentials are configured, the user's app_metadata
 * is flagged so subsequent logins skip the redirect.
 */
exports.onExecutePostLogin = async (event, api) => {
  // --- Domain restriction ---
  const email = event.user.email || "";
  const domain = email.split("@")[1];
  if (!domain || domain.toLowerCase() !== "mapp.com") {
    api.access.deny("Access is restricted to @mapp.com email addresses.");
    return;
  }

  // Skip if credentials are already configured
  if (event.user.app_metadata && event.user.app_metadata.mapp_credentials_configured) {
    return;
  }

  // Skip if redirect is not possible (e.g. refresh tokens, prompt=none)
  if (!api.redirect.canRedirect()) {
    return;
  }

  const setupUrl = event.secrets.SETUP_URL;
  const secret = event.secrets.SESSION_TOKEN_SECRET;

  if (!setupUrl || !secret) {
    console.log("SETUP_URL or SESSION_TOKEN_SECRET not configured, skipping redirect");
    return;
  }

  // Encode a signed session token with the user's identity
  const token = api.redirect.encodeToken({
    secret: secret,
    expiresInSeconds: 600,
    payload: {
      email: event.user.email,
      continue_uri: `https://${event.secrets.AUTH0_DOMAIN || event.request.hostname}/continue`
    }
  });

  // Redirect user to the setup page
  api.redirect.sendUserTo(setupUrl, {
    query: { session_token: token }
  });
};

exports.onContinuePostLogin = async (event, api) => {
  // Mark the user as having configured credentials
  api.user.setAppMetadata("mapp_credentials_configured", true);
};
