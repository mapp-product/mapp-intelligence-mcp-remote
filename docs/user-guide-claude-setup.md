# Setting Up Mapp Intelligence MCP in Claude

This guide walks you through connecting the Mapp Intelligence MCP server to Claude so you can query your analytics data directly from a Claude conversation — no dashboards, no exports, just plain-language questions and answers.

---

## Prerequisites

Before you start, make sure you have:

- **A @mapp.com email address** — required for authentication. Personal email addresses will be rejected.
- **A Mapp Intelligence API client ID and client secret** — find these in your Mapp Intelligence account under **Settings → API Credentials**, or ask your administrator.
- **Access to Claude at [claude.ai](https://claude.ai)** — you need a **Claude Pro, Team, or Enterprise** plan that supports MCP integrations.

---

## Step 1: Add the MCP Integration in Claude

1. Go to [claude.ai](https://claude.ai) and log in with your account.
2. Click on your **profile icon** in the bottom-left corner of the screen.
3. Select **"Settings"** from the menu.
4. Navigate to the **"Integrations"** section (listed under "Connected apps" or "Integrations" depending on your plan).
5. Click **"Add more integrations"**.
6. Choose **"Add custom MCP server"** (or a similar option — the exact label may vary depending on Claude's current UI).
7. Fill in the following details:
   - **Name**: `Mapp Intelligence` (or any label you prefer)
   - **URL**: `https://mapp-intelligence-mcp-remote.vercel.app/api/mcp`
8. Click **"Save"** or **"Connect"**.

> **[Screenshot placeholder]**: _Add a screenshot of the Claude integrations settings page showing where to add a new MCP integration._

---

## Step 2: Authenticate with Auth0

After saving the integration, Claude will redirect you to the Mapp Intelligence authentication page.

1. You'll land on an **Auth0 login page**.
2. If you already have an account, enter your **@mapp.com email** and password, then click **"Log In"**.
3. If this is your first time, click **"Sign Up"** and create an account using your **@mapp.com email address**.
4. Complete any email verification steps if prompted.

> **Important**: Only **@mapp.com** email addresses are permitted. If you try to sign up or log in with a personal or non-Mapp email address, access will be denied.

> **[Screenshot placeholder]**: _Add a screenshot of the Auth0 login/signup page._

---

## Step 3: Enter Your Mapp Intelligence API Credentials

After signing in, you'll be redirected to the **"Connect Mapp Intelligence"** setup page.

1. You'll see a form with three fields:
   - **Base URL**: Leave this as `https://intelligence.eu.mapp.com` unless your Mapp Intelligence instance is in a different region. If you're unsure, leave the default.
   - **Client ID**: Enter your Mapp Intelligence API client ID.
   - **Client Secret**: Enter your Mapp Intelligence API client secret.
2. Click **"Save & Continue"**.
3. You'll see a success message, and you'll be automatically redirected back to Claude to complete the authentication flow.

> **[Screenshot placeholder]**: _Add a screenshot of the credential setup page showing the Base URL, Client ID, and Client Secret fields._

> **Note**: Your credentials are encrypted with AES-256-GCM before being stored. They are never stored or transmitted in plain text after you save them.

---

## Step 4: Start Using Mapp Intelligence in Claude

You're all set! Now you can use Mapp Intelligence tools directly inside Claude conversations.

1. Return to [claude.ai](https://claude.ai) and start a **new conversation**.
2. You should see **"Mapp Intelligence"** listed as an available integration.
3. Try asking Claude something like:
   - _"List all available dimensions and metrics in Mapp Intelligence"_
   - _"Show me my page impressions for the last 7 days"_
   - _"What segments are defined in my Mapp Intelligence account?"_
   - _"How many API calculations have I used this month?"_

Claude will call the appropriate Mapp Intelligence tools and return results directly in the chat.

> **[Screenshot placeholder]**: _Add a screenshot showing Claude with the Mapp Intelligence tools available and an example query response._

---

## Managing Your Credentials

If you need to update your API credentials later (for example, if they have been rotated or if you switch to a different Mapp Intelligence instance):

1. Go to [https://mapp-intelligence-mcp-remote.vercel.app/settings](https://mapp-intelligence-mcp-remote.vercel.app/settings)
2. Click **"Sign In"** and authenticate with your @mapp.com account.
3. Update your **Client ID**, **Client Secret**, and/or **Base URL** as needed.
4. You can also **delete your stored credentials** from this page if you no longer need the integration.

> **[Screenshot placeholder]**: _Add a screenshot of the settings page showing the credential management interface._

---

## Available Tools

Once connected, you have access to **13 analytics tools** across four categories:

| Category | What you can do |
|----------|----------------|
| **Discovery** | List all available dimensions, metrics, segments, and time filters supported by your Mapp Intelligence account |
| **Analysis** | Run analytics queries with custom dimensions, metrics, filters, and date ranges |
| **Reports** | Execute saved reports or custom report configurations |
| **Usage** | Check your monthly API quota and see how many calculations you've used |

You don't need to know the tool names — just describe what you want in plain language and Claude will select and call the right tool automatically.

---

## Troubleshooting

### "Access is restricted to @mapp.com email addresses"
You attempted to log in or sign up with a non-Mapp email address. You must use a **@mapp.com** email to access this integration.

### "Mapp Intelligence credentials not configured"
You haven't entered your API credentials yet. Visit the setup page at [https://mapp-intelligence-mcp-remote.vercel.app](https://mapp-intelligence-mcp-remote.vercel.app) or the [settings page](https://mapp-intelligence-mcp-remote.vercel.app/settings) to configure them.

### "Mapp authentication failed"
Your Mapp Intelligence API client ID or client secret is incorrect. Double-check the values in your Mapp Intelligence account under **Settings → API Credentials**, or contact your administrator.

### "Invalid or expired token"
Your authentication session has expired. Try **disconnecting and reconnecting** the MCP integration in Claude:
1. Go to Claude **Settings → Integrations**.
2. Find Mapp Intelligence and disconnect it.
3. Re-add the integration following Step 1 above.

### I need help getting API credentials
Contact your **Mapp Intelligence administrator** or log in to the Mapp Intelligence dashboard and navigate to **Settings → API Credentials**.

---

*Last updated: February 2026*
