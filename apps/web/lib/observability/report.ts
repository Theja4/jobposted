type ReportContext = Record<string, unknown>;

function serializeValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return Object.prototype.toString.call(value);

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => serializeValue(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = serializeValue(inner, depth + 1);
  }
  return out;
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const serialized = serializeValue(error);
  if (serialized && typeof serialized === "object" && !Array.isArray(serialized)) {
    return serialized;
  }
  return { message: String(serialized) };
}

function stringifyPayload(payload: Record<string, unknown>) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      message: payload.message,
      error: { message: "Failed to serialize error payload" },
      service: payload.service,
      timestamp: payload.timestamp,
    });
  }
}

export async function reportError(
  message: string,
  error: unknown,
  context: ReportContext = {},
) {
  const payload = {
    message,
    error: errorPayload(error),
    context: serializeValue(context),
    service: "jobposted-web",
    timestamp: new Date().toISOString(),
  };

  console.error(message, stringifyPayload(payload));

  const endpoint = process.env.ERROR_REPORTING_WEBHOOK_URL;
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Do not let reporting failures mask the original application error.
  }
}
