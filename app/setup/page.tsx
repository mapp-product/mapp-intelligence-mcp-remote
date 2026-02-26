"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type FormState = "loading" | "form" | "saving" | "success" | "error";

function SetupForm() {
  const searchParams = useSearchParams();
  const sessionToken = searchParams.get("session_token");
  const state = searchParams.get("state");
  const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";

  const [formState, setFormState] = useState<FormState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [baseUrl, setBaseUrl] = useState("https://intelligence.eu.mapp.com");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    if (!sessionToken || !state) {
      setFormState("error");
      setErrorMessage(
        "Missing session parameters. This page should only be accessed during the login flow."
      );
    } else {
      setFormState("form");
    }
  }, [sessionToken, state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("saving");
    setErrorMessage("");

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken,
          clientId,
          clientSecret,
          baseUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormState("error");
        setErrorMessage(data.error || "Failed to save credentials");
        return;
      }

      setFormState("success");

      // Redirect back to Auth0 to continue the login flow
      setTimeout(() => {
        window.location.href = `https://${auth0Domain}/continue?state=${state}`;
      }, 1500);
    } catch (err) {
      setFormState("error");
      setErrorMessage("Network error. Please try again.");
      console.error(err);
    }
  }

  return (
    <>
      {formState === "error" && (
        <div style={styles.errorBanner}>
          <span style={styles.errorIcon}>&#9888;</span>
          {errorMessage}
          {!sessionToken && (
            <p style={styles.errorHint}>
              Please connect through your MCP client (Claude, Cursor, etc.) to
              begin the setup process.
            </p>
          )}
        </div>
      )}

      {formState === "success" && (
        <div style={styles.successBanner}>
          <span style={styles.successIcon}>&#10003;</span>
          Credentials saved. Returning to complete login...
        </div>
      )}

      {(formState === "form" || formState === "saving") && (
        <form onSubmit={handleSubmit} style={styles.form}>
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
            <span style={styles.hint}>
              The Mapp Intelligence API endpoint for your region
            </span>
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
            disabled={formState === "saving"}
            style={{
              ...styles.button,
              ...(formState === "saving" ? styles.buttonDisabled : {}),
            }}
          >
            {formState === "saving" ? "Saving..." : "Save & Continue"}
          </button>
        </form>
      )}
    </>
  );
}

export default function SetupPage() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={styles.icon}>
            <rect width="40" height="40" rx="10" fill="#0052FF" />
            <path
              d="M12 20L18 26L28 14"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 style={styles.title}>Connect Mapp Intelligence</h1>
          <p style={styles.subtitle}>
            Enter your Mapp Intelligence API credentials to start using the MCP
            tools. Your credentials are encrypted and stored securely.
          </p>
        </div>

        <Suspense fallback={<p style={{ textAlign: "center", color: "#6b7280" }}>Loading...</p>}>
          <SetupForm />
        </Suspense>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Your credentials are encrypted with AES-256-GCM before storage.
            <br />
            You can update them anytime from the{" "}
            <a href="/settings" style={styles.link}>
              Settings page
            </a>
            .
          </p>
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
    maxWidth: "480px",
    width: "100%",
  },
  logoSection: {
    textAlign: "center" as const,
    marginBottom: "2rem",
  },
  icon: {
    marginBottom: "1rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 0.5rem 0",
  },
  subtitle: {
    fontSize: "0.9rem",
    color: "#6b7280",
    lineHeight: 1.5,
    margin: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
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
    transition: "border-color 0.2s",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  button: {
    padding: "0.8rem",
    background: "#0052FF",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "0.5rem",
    transition: "background 0.2s",
  },
  buttonDisabled: {
    background: "#93c5fd",
    cursor: "not-allowed",
  },
  errorBanner: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "1rem",
    color: "#991b1b",
    fontSize: "0.85rem",
    marginBottom: "1rem",
    lineHeight: 1.5,
  },
  errorIcon: {
    marginRight: "0.5rem",
  },
  errorHint: {
    marginTop: "0.5rem",
    fontSize: "0.8rem",
    color: "#b91c1c",
  },
  successBanner: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "1rem",
    color: "#166534",
    fontSize: "0.9rem",
    textAlign: "center" as const,
  },
  successIcon: {
    marginRight: "0.5rem",
    fontWeight: 700,
  },
  footer: {
    marginTop: "1.5rem",
    borderTop: "1px solid #f3f4f6",
    paddingTop: "1rem",
  },
  footerText: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    textAlign: "center" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  link: {
    color: "#0052FF",
    textDecoration: "none",
  },
};
