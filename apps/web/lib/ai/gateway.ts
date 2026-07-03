/**
 * Thin OpenAI-compatible JSON client. Server-only — keys never reach the browser
 * or extension. Microsoft Foundry is the primary provider when configured;
 * OpenRouter remains the secondary provider.
 */

export class GatewayError extends Error {}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";
const DEFAULT_FOUNDRY_MODELS = ["gpt-5.4-mini", "DeepSeek-V4-Flash"];

type ProviderName = "foundry" | "openrouter";

type ProviderConfig = {
  name: ProviderName;
  baseUrl: string;
  model: string;
  headers: Record<string, string>;
  timeoutMs?: number;
};

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function envList(...names: string[]) {
  return names
    .flatMap((name) => (process.env[name] ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeBaseUrl(rawUrl: string, suffix: "/api/v1" | "/openai/v1") {
  let base = rawUrl.replace(/\/+$/, "");
  if (suffix === "/openai/v1") {
    base = base.replace(/\/openai\/v1$/i, "").replace(/\/api\/projects\/[^/]+$/i, "");
  }
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function providerLabel(provider: ProviderConfig | ProviderName) {
  const name = typeof provider === "string" ? provider : provider.name;
  return name === "foundry" ? "Foundry" : "OpenRouter";
}

function providerErrorPrefix(provider: ProviderName) {
  return provider === "foundry" ? "FOUNDRY_API_ERROR" : "OPENROUTER_API_ERROR";
}

function usesMaxCompletionTokens(provider: ProviderConfig) {
  return provider.name === "foundry" && /^gpt-5/i.test(provider.model);
}

function resolveFoundryModels() {
  const configuredChain = envList(
    "AZURE_AI_FOUNDRY_MODELS",
    "AZURE_AI_FOUNDRY_DEPLOYMENTS",
    "MICROSOFT_FOUNDRY_MODELS",
    "MICROSOFT_FOUNDRY_DEPLOYMENTS",
    "FOUNDRY_MODELS",
    "FOUNDRY_DEPLOYMENTS",
  );
  if (configuredChain.length > 0) return uniq(configuredChain);

  const primaryModel = env(
    "AZURE_AI_FOUNDRY_PRIMARY_MODEL",
    "AZURE_AI_FOUNDRY_PRIMARY_DEPLOYMENT",
    "MICROSOFT_FOUNDRY_PRIMARY_MODEL",
    "MICROSOFT_FOUNDRY_PRIMARY_DEPLOYMENT",
    "FOUNDRY_PRIMARY_MODEL",
    "FOUNDRY_PRIMARY_DEPLOYMENT",
  );
  const secondaryModel = env(
    "AZURE_AI_FOUNDRY_SECONDARY_MODEL",
    "AZURE_AI_FOUNDRY_SECONDARY_DEPLOYMENT",
    "MICROSOFT_FOUNDRY_SECONDARY_MODEL",
    "MICROSOFT_FOUNDRY_SECONDARY_DEPLOYMENT",
    "FOUNDRY_SECONDARY_MODEL",
    "FOUNDRY_SECONDARY_DEPLOYMENT",
  );
  if (primaryModel || secondaryModel) return uniq([primaryModel, secondaryModel]);

  const standardModel = env(
    "AZURE_AI_FOUNDRY_MODEL",
    "AZURE_AI_FOUNDRY_DEPLOYMENT",
    "MICROSOFT_FOUNDRY_MODEL",
    "MICROSOFT_FOUNDRY_DEPLOYMENT",
    "FOUNDRY_MODEL",
    "FOUNDRY_DEPLOYMENT",
  );
  const premiumModel = env(
    "AZURE_AI_FOUNDRY_MODEL_PREMIUM",
    "AZURE_AI_FOUNDRY_DEPLOYMENT_PREMIUM",
    "MICROSOFT_FOUNDRY_MODEL_PREMIUM",
    "MICROSOFT_FOUNDRY_DEPLOYMENT_PREMIUM",
    "FOUNDRY_MODEL_PREMIUM",
    "FOUNDRY_DEPLOYMENT_PREMIUM",
  );

  return uniq([standardModel, premiumModel, ...DEFAULT_FOUNDRY_MODELS]);
}

function providerOrder(): ProviderName[] {
  const configured = env("LLM_PROVIDER_ORDER", "AI_PROVIDER_ORDER");
  if (!configured) return ["foundry", "openrouter"];

  const providers = configured
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is ProviderName => provider === "foundry" || provider === "openrouter");
  return providers.length > 0 ? providers : ["foundry", "openrouter"];
}

export function gatewayConfigured(): boolean {
  return getProviderConfigs().length > 0;
}

function getProviderConfigs(modelOverride?: string): ProviderConfig[] {
  const foundryEndpoint = env("AZURE_AI_FOUNDRY_ENDPOINT", "MICROSOFT_FOUNDRY_ENDPOINT", "FOUNDRY_ENDPOINT");
  const foundryKey = env("AZURE_AI_FOUNDRY_API_KEY", "MICROSOFT_FOUNDRY_API_KEY", "FOUNDRY_API_KEY");
  const foundryModels = resolveFoundryModels();

  const siteUrl = env("OPENROUTER_SITE_URL", "NEXT_PUBLIC_SITE_URL") || "https://jobposted.app";
  const openRouterKey = env("OPENROUTER_API_KEY", "ANTHROPIC_AUTH_TOKEN");
  const openRouterModel = modelOverride || env("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL;

  const available: Partial<Record<ProviderName, ProviderConfig[]>> = {};

  if (foundryEndpoint && foundryKey && foundryModels.length > 0) {
    const primaryTimeoutMs = numberEnv("FOUNDRY_PRIMARY_TIMEOUT_MS", 30_000);
    const secondaryTimeoutMs = numberEnv("FOUNDRY_SECONDARY_TIMEOUT_MS", 45_000);
    available.foundry = foundryModels.map((model, index) => ({
      name: "foundry",
      baseUrl: normalizeBaseUrl(foundryEndpoint, "/openai/v1"),
      model,
      timeoutMs: index === 0 ? primaryTimeoutMs : secondaryTimeoutMs,
      headers: {
        "api-key": foundryKey,
      },
    }));
  }

  if (openRouterKey) {
    available.openrouter = [{
      name: "openrouter",
      baseUrl: normalizeBaseUrl(env("OPENROUTER_BASE_URL") || OPENROUTER_BASE_URL, "/api/v1"),
      model: openRouterModel,
      headers: {
        authorization: `Bearer ${openRouterKey}`,
        "HTTP-Referer": siteUrl,
        "X-Title": env("OPENROUTER_APP_TITLE", "OPENROUTER_SITE_NAME") || "JobPosted",
        "X-OpenRouter-Title": "JobPosted",
      },
    }];
  }

  return providerOrder().flatMap((provider) => available[provider] ?? []);
}

function parseJSON<T>(content: string, provider: ProviderConfig): T {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new GatewayError(`${providerLabel(provider)} returned invalid JSON.`);
  }
}

export async function callGatewayJSON<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
}): Promise<T> {
  const providers = getProviderConfigs(args.model);
  if (providers.length === 0) throw new GatewayError("AI provider is not configured.");

  const failures: string[] = [];
  for (const provider of providers) {
    const timeoutMs = Math.min(args.timeoutMs ?? 60_000, provider.timeoutMs ?? args.timeoutMs ?? 60_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestBody: Record<string, unknown> = {
        model: provider.model,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        [usesMaxCompletionTokens(provider) ? "max_completion_tokens" : "max_tokens"]: args.maxTokens ?? 4096,
      };
      if (args.temperature !== undefined) requestBody.temperature = args.temperature;

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...provider.headers,
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        failures.push(`${provider.name}/${provider.model}: ${providerErrorPrefix(provider.name)} ${response.status}: ${await response.text()}`);
        continue;
      }
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        failures.push(`${provider.name}/${provider.model}: EMPTY_RESPONSE`);
        continue;
      }
      return parseJSON<T>(content, provider);
    } catch (error) {
      failures.push(
        `${provider.name}/${provider.model}: ${
          error instanceof Error && error.name === "AbortError"
            ? `TIMEOUT after ${timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error)
        }`,
      );
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new GatewayError(failures.join(" | ") || "AI provider request failed.");
}
