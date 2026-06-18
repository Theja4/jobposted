import type { OnboardingConfig } from "@/lib/onboarding/model";
import type { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseServiceRoleClient = NonNullable<ReturnType<typeof getServiceRoleClient>>;
type OnboardingConfigurationClient = SupabaseServerClient | SupabaseServiceRoleClient;

type SaveOnboardingConfigurationOptions = {
  userId: string;
  config: OnboardingConfig;
  completedAt?: string;
  updatedAt?: string;
};

type SaveOnboardingConfigurationResult =
  | { ok: true; degraded: boolean; warning?: unknown }
  | { ok: false; error: unknown };

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dbErrorText(error: unknown) {
  const record = rec(error);
  return [record.code, record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function isMissingOnboardingTimestampColumn(error: unknown) {
  const text = dbErrorText(error);
  const mentionsTimestampColumn =
    text.includes("completed_at") || text.includes("updated_at") || text.includes("created_at");
  return (
    mentionsTimestampColumn &&
    (text.includes("column") || text.includes("schema cache") || text.includes("pgrst204"))
  );
}

function isMissingConflictTarget(error: unknown) {
  const text = dbErrorText(error);
  return text.includes("42p10") || text.includes("no unique") || text.includes("on conflict");
}

function payloadsFor(options: SaveOnboardingConfigurationOptions) {
  const now = options.updatedAt ?? new Date().toISOString();
  const base = {
    user_id: options.userId,
    data: options.config,
  };
  const candidates: Record<string, unknown>[] = [];

  if (options.completedAt) {
    candidates.push({ ...base, completed_at: options.completedAt, updated_at: now });
    candidates.push({ ...base, completed_at: options.completedAt });
  }
  candidates.push({ ...base, updated_at: now });
  candidates.push(base);

  const seen = new Set<string>();
  return candidates.flatMap((payload, index) => {
    const key = Object.keys(payload).sort().join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ payload, degraded: index > 0 }];
  });
}

function withoutUserId(payload: Record<string, unknown>) {
  const updatePayload = { ...payload };
  delete updatePayload.user_id;
  return updatePayload;
}

async function writeWithoutUpsertConflict(
  supabase: OnboardingConfigurationClient,
  options: SaveOnboardingConfigurationOptions,
  warning: unknown,
): Promise<SaveOnboardingConfigurationResult> {
  let lastError: unknown = warning;

  for (const { payload, degraded } of payloadsFor(options)) {
    const { error: updateError, count } = await supabase
      .from("onboarding_configurations")
      .update(withoutUserId(payload), { count: "exact" })
      .eq("user_id", options.userId);

    if (!updateError && (count ?? 0) > 0) return { ok: true, degraded, warning };
    if (updateError) {
      lastError = updateError;
      if (isMissingOnboardingTimestampColumn(updateError) && !degraded) continue;
      if (!isMissingOnboardingTimestampColumn(updateError)) return { ok: false, error: updateError };
    }

    const { error: insertError } = await supabase.from("onboarding_configurations").insert(payload);
    if (!insertError) return { ok: true, degraded, warning };

    lastError = insertError;
    if (isMissingOnboardingTimestampColumn(insertError) && !degraded) continue;
    return { ok: false, error: insertError };
  }

  return { ok: false, error: lastError };
}

export async function saveOnboardingConfiguration(
  supabase: OnboardingConfigurationClient,
  options: SaveOnboardingConfigurationOptions,
): Promise<SaveOnboardingConfigurationResult> {
  let firstError: unknown = null;

  for (const { payload, degraded } of payloadsFor(options)) {
    const { error } = await supabase
      .from("onboarding_configurations")
      .upsert(payload, { onConflict: "user_id" });

    if (!error) return { ok: true, degraded, warning: firstError ?? undefined };
    firstError ??= error;

    if (isMissingConflictTarget(error)) {
      return writeWithoutUpsertConflict(supabase, options, firstError);
    }

    if (isMissingOnboardingTimestampColumn(error) && !degraded) continue;
    return { ok: false, error };
  }

  return { ok: false, error: firstError };
}
