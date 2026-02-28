type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function truncate(value: string, limit = 240): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function extractToolName(parameters: unknown): string | undefined {
  const params = asObject(parameters);
  if (!params) return undefined;
  return asString(params.name);
}

function extractErrorSummary(errorValue: unknown): string | undefined {
  if (typeof errorValue === "string") {
    return truncate(errorValue);
  }

  const errorObj = asObject(errorValue);
  if (!errorObj) return undefined;

  const name = asString(errorObj.name);
  const message = asString(errorObj.message);
  if (name && message) return truncate(`${name}: ${message}`);
  if (message) return truncate(message);
  return undefined;
}

export function logMcpEvent(namespace: string, event: unknown): void {
  const eventObj = asObject(event);
  if (!eventObj) return;

  const type = asString(eventObj.type) || "UNKNOWN";
  const payload: JsonObject = {
    namespace,
    type,
    sessionId: asString(eventObj.sessionId),
    requestId: asString(eventObj.requestId),
  };

  if (type === "REQUEST_RECEIVED" || type === "REQUEST_COMPLETED") {
    const method = asString(eventObj.method);
    payload.method = method;
    payload.status = asString(eventObj.status) || "unknown";

    if (typeof eventObj.duration === "number") {
      payload.durationMs = Math.round(eventObj.duration);
    }

    if (method === "tools/call") {
      const toolName = extractToolName(eventObj.parameters);
      if (toolName) payload.tool = toolName;
    }
  }

  if (type === "ERROR") {
    payload.source = asString(eventObj.source) || "unknown";
    payload.severity = asString(eventObj.severity) || "error";
    payload.context = asString(eventObj.context);
    const summary = extractErrorSummary(eventObj.error);
    if (summary) payload.error = summary;
  }

  console.info(`[mcp-event] ${JSON.stringify(payload)}`);
}
