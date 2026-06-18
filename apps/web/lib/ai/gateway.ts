/**
 * Thin OpenAI-compatible JSON client. Server-only — keys never reach the browser
 * or extension. OpenRouter is the primary provider; Vercel AI Gateway remains a
 * backward-compatible fallback for older deployments.
 */

export class GatewayError extends Error {}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const VERCEL_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat";
const DEFAULT_VERCEL_MODEL = "openai/gpt-5-mini";

type ProviderConfig = {
  name: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  headers: Record<string, string>;
};

export function gatewayConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function providerConfig(modelOverride?: string): ProviderConfig {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jobposted.app";
    return {
      name: "OpenRouter",
      apiKey: openRouterKey,
      baseUrl: (process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).replace(/\/$/, ""),
      model: modelOverride || process.env.OPENROUTER_MODEL || process.env.AI_GATEWAY_MODEL || DEFAULT_OPENROUTER_MODEL,
      headers: {
        "HTTP-Referer": siteUrl,
        "X-OpenRouter-Title": "JobPosted",
      },
    };
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  return {
    name: "AI Gateway",
    apiKey,
    baseUrl: (process.env.AI_GATEWAY_BASE_URL || VERCEL_GATEWAY_BASE_URL).replace(/\/$/, ""),
    model: modelOverride || process.env.AI_GATEWAY_MODEL || DEFAULT_VERCEL_MODEL,
    headers: {},
  };
}

export async function callGatewayJSON<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<T> {
  const provider = providerConfig(args.model);
  if (!provider.apiKey) throw new GatewayError("AI provider is not configured.");

  const timeoutMs = args.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new GatewayError(`${provider.name} request timed out after ${timeoutMs}ms.`));
  }, timeoutMs);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
        ...provider.headers,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
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
      throw new GatewayError(`${provider.name} responded ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new GatewayError(`${provider.name} returned an empty response.`);
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new GatewayError(`${provider.name} returned invalid JSON.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
