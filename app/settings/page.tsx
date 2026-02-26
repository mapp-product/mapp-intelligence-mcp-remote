"use client";

import { useState, useEffect, useCallback } from "react";

type PageState = "loading" | "unauthenticated" | "authenticated" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

interface CredentialInfo {
  configured: boolean;
  clientId?: string;
  baseUrl?: string;
}

export default function SettingsPage() {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";
  const settingsClientId = process.env.NEXT_PUBLIC_AUTH0_SETTINGS_CLIENT_ID || "";
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [credentialInfo, setCredentialInfo] = useState<CredentialInfo | null>(null);
  const [baseUrl, setBaseUrl] = useState("https://intelligence.eu.mapp.com");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  // Check for access token in the URL fragment on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const token = params.get("access_token");
    const error = params.get("error");

    // Clear the hash from the URL for cleanliness
    if (hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (token) {
      setAccessToken(token);
      setPageState("authenticated");
    } else if (error) {
      setPageState("error");
      setErrorMessage(decodeURIComponent(error));
    } else {
      setPageState("unauthenticated");
    }
  }, []);

  // Fetch current credential status when authenticated
  const fetchCredentials = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredentialInfo(data);
        if (data.configured && data.baseUrl) {
          setBaseUrl(data.baseUrl);
        }
      } else if (res.status === 401) {
        setPageState("unauthenticated");
        setAccessToken(null);
      }
    } catch (err) {
      console.error("Failed to fetch credentials:", err);
    }
  }, [accessToken]);

  useEffect(() => {
    if (pageState === "authenticated") {
      fetchCredentials();
    }
  }, [pageState, fetchCredentials]);

  function redirectToLogin() {
    const callbackUrl = `${window.location.origin}/api/auth/callback`;
    const authUrl =
      `https://${domain}/authorize?` +
      `response_type=code&` +
      `client_id=${settingsClientId}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `audience=${encodeURIComponent(audience)}&` +
      `scope=openid+profile+email`;
    window.location.href = authUrl;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    setSaveMessage("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clientId, clientSecret, baseUrl }),
      });

      const text = await res.text();
      let data: { error?: string; success?: boolean } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: `Server error (${res.status})` };
      }

      if (res.ok) {
        setSaveState("saved");
        setSaveMessage("Credentials saved successfully.");
        setClientId("");
        setClientSecret("");
        fetchCredentials();
        setTimeout(() => setSaveState("idle"), 3000);
      } else {
        setSaveState("error");
        setSaveMessage(data.error || "Failed to save credentials.");
      }
    } catch {
      setSaveState("error");
      setSaveMessage("Network error. Please try again.");
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        setCredentialInfo({ configured: false });
        setDeleteConfirm(false);
        setSaveState("saved");
        setSaveMessage("Credentials deleted.");
        setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch {
      setSaveMessage("Failed to delete credentials.");
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="9" fill="#0052FF" />
            <path
              d="M18 11V13M18 23V25M11 18H13M23 18H25M13.05 13.05L14.46 14.46M21.54 21.54L22.95 22.95M13.05 22.95L14.46 21.54M21.54 14.46L22.95 13.05"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="18" cy="18" r="3" stroke="white" strokeWidth="2" />
          </svg>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.subtitle}>
            Manage your Mapp Intelligence API credentials.
          </p>
        </div>

        {/* Unauthenticated state */}
        {pageState === "unauthenticated" && (
          <div style={styles.section}>
            <p style={styles.infoText}>
              Sign in with your account to view and manage your Mapp credentials.
            </p>
            <button onClick={redirectToLogin} style={styles.primaryButton}>
              Sign In
            </button>
          </div>
        )}

        {/* Loading state */}
        {pageState === "loading" && (
          <div style={styles.section}>
            <p style={styles.infoText}>Loading...</p>
          </div>
        )}

        {/* Error state */}
        {pageState === "error" && (
          <div style={styles.section}>
            <div style={styles.errorBanner}>{errorMessage}</div>
            <button onClick={redirectToLogin} style={styles.primaryButton}>
              Try Again
            </button>
          </div>
        )}

        {/* Authenticated state */}
        {pageState === "authenticated" && (
          <>
            {/* Current status */}
            {credentialInfo && (
              <div style={styles.statusSection}>
                <h2 style={styles.sectionTitle}>Current Status</h2>
                {credentialInfo.configured ? (
                  <div style={styles.statusConfigured}>
                    <span style={styles.statusDot}>&#9679;</span>
                    <div>
                      <strong>Credentials configured</strong>
                      <br />
                      <span style={styles.statusDetail}>
                        Client ID: {credentialInfo.clientId}
                      </span>
                      <br />
                      <span style={styles.statusDetail}>
                        Base URL: {credentialInfo.baseUrl}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.statusNotConfigured}>
                    <span style={styles.statusDotWarn}>&#9679;</span>
                    <span>No credentials configured yet.</span>
                  </div>
                )}
              </div>
            )}

            {/* Save feedback */}
            {saveState === "saved" && (
              <div style={styles.successBanner}>{saveMessage}</div>
            )}
            {saveState === "error" && (
              <div style={styles.errorBanner}>{saveMessage}</div>
            )}

            {/* Credential form */}
            <form onSubmit={handleSave} style={styles.form}>
              <h2 style={styles.sectionTitle}>
                {credentialInfo?.configured
                  ? "Update Credentials"
                  : "Add Credentials"}
              </h2>

              <div style={styles.field}>
                <label htmlFor="baseUrl" style={styles.label}>
                  Base URL
                </label>
                <input
                  id="baseUrl"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://intelligence.eu.mapp.com"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label htmlFor="clientId" style={styles.label}>
                  Client ID
                </label>
                <input
                  id="clientId"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. NWDV8OG9PD"
                  required
                  autoComplete="off"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label htmlFor="clientSecret" style={styles.label}>
                  Client Secret
                </label>
                <input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Enter your client secret"
                  required
                  autoComplete="off"
                  style={styles.input}
                />
              </div>

              <button
                type="submit"
                disabled={saveState === "saving"}
                style={{
                  ...styles.primaryButton,
                  ...(saveState === "saving" ? styles.buttonDisabled : {}),
                }}
              >
                {saveState === "saving" ? "Saving..." : "Save Credentials"}
              </button>
            </form>

            {/* Delete section */}
            {credentialInfo?.configured && (
              <div style={styles.dangerSection}>
                <h2 style={styles.dangerTitle}>Danger Zone</h2>
                <p style={styles.dangerText}>
                  Remove your stored credentials. MCP tools will stop working
                  until new credentials are provided.
                </p>
                <button
                  onClick={handleDelete}
                  style={
                    deleteConfirm ? styles.dangerButtonConfirm : styles.dangerButton
                  }
                >
                  {deleteConfirm
                    ? "Click again to confirm deletion"
                    : "Delete Credentials"}
                </button>
                {deleteConfirm && (
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <div style={styles.footer}>
          <a href="/" style={styles.footerLink}>
            &larr; Back to home
          </a>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    padding: "1rem",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    boxShadow:
      "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
    padding: "2.5rem",
    maxWidth: "520px",
    width: "100%",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "2rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0.75rem 0 0.5rem 0",
  },
  subtitle: {
    fontSize: "0.9rem",
    color: "#6b7280",
    margin: 0,
  },
  section: {
    textAlign: "center" as const,
  },
  infoText: {
    color: "#6b7280",
    fontSize: "0.9rem",
    marginBottom: "1.5rem",
  },
  statusSection: {
    marginBottom: "1.5rem",
    padding: "1rem",
    background: "#f9fafb",
    borderRadius: "10px",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#374151",
    margin: "0 0 0.75rem 0",
  },
  statusConfigured: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    fontSize: "0.85rem",
    color: "#374151",
  },
  statusDot: {
    color: "#22c55e",
    fontSize: "0.7rem",
    marginTop: "0.2rem",
  },
  statusDotWarn: {
    color: "#f59e0b",
    fontSize: "0.7rem",
    marginTop: "0.15rem",
  },
  statusNotConfigured: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.85rem",
    color: "#92400e",
  },
  statusDetail: {
    fontSize: "0.8rem",
    color: "#6b7280",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
    marginBottom: "1.5rem",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    padding: "0.7rem 0.85rem",
    border: "1.5px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "0.9rem",
    color: "#1f2937",
    outline: "none",
  },
  primaryButton: {
    padding: "0.8rem",
    background: "#0052FF",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  buttonDisabled: {
    background: "#93c5fd",
    cursor: "not-allowed",
  },
  errorBanner: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "0.85rem",
    color: "#991b1b",
    fontSize: "0.85rem",
    marginBottom: "1rem",
  },
  successBanner: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "0.85rem",
    color: "#166534",
    fontSize: "0.85rem",
    marginBottom: "1rem",
  },
  dangerSection: {
    marginTop: "1rem",
    padding: "1rem",
    border: "1px solid #fecaca",
    borderRadius: "10px",
    background: "#fff5f5",
  },
  dangerTitle: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#991b1b",
    margin: "0 0 0.5rem 0",
  },
  dangerText: {
    fontSize: "0.8rem",
    color: "#7f1d1d",
    margin: "0 0 0.75rem 0",
    lineHeight: 1.5,
  },
  dangerButton: {
    padding: "0.6rem 1rem",
    background: "#fff",
    color: "#dc2626",
    border: "1.5px solid #dc2626",
    borderRadius: "8px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerButtonConfirm: {
    padding: "0.6rem 1rem",
    background: "#dc2626",
    color: "#fff",
    border: "1.5px solid #dc2626",
    borderRadius: "8px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelButton: {
    padding: "0.6rem 1rem",
    background: "transparent",
    color: "#6b7280",
    border: "none",
    fontSize: "0.85rem",
    cursor: "pointer",
    marginLeft: "0.5rem",
  },
  footer: {
    marginTop: "1.5rem",
    borderTop: "1px solid #f3f4f6",
    paddingTop: "1rem",
    textAlign: "center" as const,
  },
  footerLink: {
    fontSize: "0.85rem",
    color: "#0052FF",
    textDecoration: "none",
  },
};
