/**
 * Thin Vercel AI Gateway JSON client. Server-only — the key never reaches the
 * browser or the extension. Used for field mapping and resume tailoring.
 */

export class GatewayError extends Error {}

export function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export async function callGatewayJSON<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) throw new GatewayError("AI Gateway is not configured.");

  const baseUrl = (process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "");
  const model = args.model || process.env.AI_GATEWAY_MODEL || "openai/gpt-5-mini";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: args.maxTokens ?? 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new GatewayError(`AI Gateway responded ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new GatewayError("AI Gateway returned an empty response.");
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new GatewayError("AI Gateway returned invalid JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}
