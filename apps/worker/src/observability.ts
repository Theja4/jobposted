type ReportContext = Record<string, unknown>;

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export async function reportError(message: string, error: unknown, context: ReportContext = {}) {
  const payload = {
    message,
    error: errorPayload(error),
    context,
    service: "jobposted-worker",
    timestamp: new Date().toISOString(),
  };
  console.error(message, payload);

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
    // Never mask the original worker failure.
  }
}
