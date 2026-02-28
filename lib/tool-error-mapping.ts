export type ToolOutcomeCode =
  | "OK"
  | "WARN_QUOTA_ZERO"
  | "E_AUTH_REQUIRED"
  | "E_CREDENTIALS_MISSING"
  | "E_UNSUPPORTED_ALIAS"
  | "E_DIMENSION_UNAVAILABLE"
  | "E_METRIC_UNAVAILABLE"
  | "E_MAPP_AUTH"
  | "E_MAPP_API"
  | "E_INTERNAL";

export interface ToolOutcomeInfo {
  outcomeCode: ToolOutcomeCode;
  details?: Record<string, unknown>;
}

export interface MappedToolError {
  code: Exclude<ToolOutcomeCode, "OK" | "WARN_QUOTA_ZERO">;
  message: string;
}

export function summarizeErrorForLog(value: string, limit = 240): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function mapToolError(error: unknown): MappedToolError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  const codedPrefixMatch = message.match(/^\[(E_[A-Z0-9_]+)\]\s*(.*)$/);
  if (codedPrefixMatch) {
    return {
      code: codedPrefixMatch[1] as Exclude<ToolOutcomeCode, "OK" | "WARN_QUOTA_ZERO">,
      message: codedPrefixMatch[2] || codedPrefixMatch[1],
    };
  }

  if (message.includes("Authentication required")) {
    return { code: "E_AUTH_REQUIRED", message };
  }
  if (
    message.includes("credentials are missing") ||
    message.includes("credentials not configured")
  ) {
    return { code: "E_CREDENTIALS_MISSING", message };
  }
  if (
    message.includes("Unsupported metric alias") ||
    message.includes("Unsupported dimension alias")
  ) {
    return { code: "E_UNSUPPORTED_ALIAS", message };
  }
  if (message.includes("Dimension '") && message.includes("does not expose")) {
    return { code: "E_DIMENSION_UNAVAILABLE", message };
  }
  if (message.includes("Metric '") && message.includes("does not expose")) {
    return { code: "E_METRIC_UNAVAILABLE", message };
  }
  if (message.includes("Mapp authentication failed")) {
    return { code: "E_MAPP_AUTH", message };
  }
  if (/^(GET|POST|DELETE)\s+.+\s+failed\s+\(\d+\):/.test(message)) {
    return { code: "E_MAPP_API", message };
  }

  return { code: "E_INTERNAL", message };
}

function getUsageMaximum(result: unknown): number | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  const maximum = (result as Record<string, unknown>).maximum;
  if (typeof maximum === "number" && Number.isFinite(maximum)) {
    return maximum;
  }

  return null;
}

export function deriveSuccessOutcome(
  toolName: string,
  result: unknown
): ToolOutcomeInfo {
  if (toolName === "get_analysis_usage") {
    const maximum = getUsageMaximum(result);
    if (maximum === 0) {
      return { outcomeCode: "WARN_QUOTA_ZERO" };
    }
  }

  return { outcomeCode: "OK" };
}
