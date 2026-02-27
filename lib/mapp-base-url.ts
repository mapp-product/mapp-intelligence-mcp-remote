const SUPPORTED_MAPP_API_BASE_URL = "https://intelligence.eu.mapp.com";

export function getMappApiBaseUrl(): string {
  const configured = process.env.MAPP_API_BASE_URL?.trim();
  if (!configured) return SUPPORTED_MAPP_API_BASE_URL;

  if (configured !== SUPPORTED_MAPP_API_BASE_URL) {
    throw new Error(
      `MAPP_API_BASE_URL must be ${SUPPORTED_MAPP_API_BASE_URL}`
    );
  }

  return configured;
}

export function validateSubmittedBaseUrl(baseUrl: unknown): string | null {
  if (baseUrl === undefined || baseUrl === null || baseUrl === "") {
    return null;
  }

  if (typeof baseUrl !== "string") {
    return `baseUrl must be ${getMappApiBaseUrl()}`;
  }

  const trimmed = baseUrl.trim();
  if (trimmed !== getMappApiBaseUrl()) {
    return `baseUrl must be ${getMappApiBaseUrl()}`;
  }

  return null;
}

export function assertTrustedMappAbsoluteUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Upstream URL is invalid");
  }

  const allowed = getMappApiBaseUrl();
  if (parsed.origin !== allowed || parsed.protocol !== "https:") {
    throw new Error(`Untrusted upstream URL origin: ${parsed.origin}`);
  }
}

