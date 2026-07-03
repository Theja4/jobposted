import { NextResponse } from "next/server";
import type {
  ExtensionAutofillPageField,
  ExtensionAutofillPlan,
  ExtensionAutofillPlanRequest,
  MasterProfile,
} from "@jobposted/shared";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { buildMasterProfile } from "@/lib/extension/profile";
import { findResumeDocuments, signedResumeUrl } from "@/lib/extension/resume";
import { callGatewayJSON, gatewayConfigured } from "@/lib/ai/gateway";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import {
  buildFallbackAutofillPlan,
  cacheablePlanAnswer,
  isConfidentPlanItem,
  normalizeAutofillPlan,
  partitionPlanFields,
  PLAN_ANSWER_KEY,
  PLAN_ANSWER_PLATFORM,
  planAnswerSignature,
  planItemFromCachedAnswer,
  profileForPrompt,
  restorePlanFieldIds,
  withShortFieldIds,
} from "./planner";

export const runtime = "nodejs";
// Without this, Vercel kills the function at the platform default (~10-15s) and
// the extension sees a 504/abort instead of the plan or its fallback.
export const maxDuration = 30;

const DEFAULT_AUTOFILL_MODEL = "inception/mercury-2";

const SYSTEM_PROMPT = `You are JobPosted's application-form autofill planner.
Return only JSON matching the schema. Plan one action per supplied fieldId.
Use the applicant profile and saved answers. Never submit the form.
Every field has a "type" and an "options" array. For any select, radio, combobox, typeahead, or multiselect field, return action "select"; never return action "fill" for a dropdown-like field. If optionMode is missing or "full", the supplied options are complete: choose ONLY from those options using their exact text (put it in optionLabel) — never write a country, city, name, date, or other free text into a complete choice field.
If optionMode is "local_dictionary" or "ranked_subset", the options array is intentionally omitted or partial to reduce tokens. In that case, use the label, optionDictionary, profile, and shown candidates to return the desired real-world value (for example "+91" or "India") and set optionLabel only when one of the supplied candidate options is the exact option to select; the extension will match the full local DOM list.
When a form has a separate phone country/calling-code dropdown and a Phone input, select the calling-code option in the dropdown and put only the national phone number in the Phone input.
For Yes/No questions (work authorization, sponsorship, "have you worked here before", age eligibility) answer exactly "Yes" or "No" to match the options — never a country or other text.
For multiselect "select all that apply" fields, set "value" to an array of the applicable option texts; for sanctions, export-control, or citizenship questions default to ["None of the above"] (or ["Not applicable"]) unless the profile clearly indicates otherwise.
Use closest-option matching when exact select/radio/combobox choices are absent.
Keep every note under 12 words, or null.
For school/university/institution fields, do NOT use closest-option matching to choose a different institution. Select the exact profile school only when it is present. If the profile school is absent, select an Other, Not listed, Not available, or equivalent option when available and keep the real school in value; otherwise skip.
If nothing matches and an Other, Prefer not to say, Decline, Choose not to answer, Not applicable, or similar option exists, select that option.
When selecting Other for a real profile value, keep the real value in value so the extension can fill a revealed free-text input.
If profile data is missing, infer low-stakes and EEO/preference answers when sensible: work authorization defaults to Yes, sponsorship defaults to No, 18+ defaults to Yes, Hispanic/Latino defaults to No.
Never fabricate hard facts: legal name, email, phone, dates, employer, title, school, degree, addresses, URLs, salary, or document names.
Set confidence below 0.7 when the user should review a guessed/default answer.
Respond with a JSON object of the form {"summary": string|null, "fields": [{"fieldId": string, "action": "fill"|"select"|"check"|"uncheck"|"attach"|"skip", "value": string|boolean|string[]|null, "optionLabel": string|null, "confidence": number, "note": string|null}]} with exactly one entry per supplied fieldId.`;

type SupabaseClient = Awaited<ReturnType<typeof getExtensionAuthContext>>["supabase"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionMode(value: unknown): ExtensionAutofillPageField["optionMode"] {
  return value === "full" || value === "local_dictionary" || value === "ranked_subset" ? value : null;
}

function optionDictionary(value: unknown): ExtensionAutofillPageField["optionDictionary"] {
  return value === "phone_country_code" ||
    value === "country" ||
    value === "region" ||
    value === "school" ||
    value === "language" ||
    value === "skill" ||
    value === "currency" ||
    value === "timezone" ||
    value === "large_unknown"
    ? value
    : null;
}

function timeoutMs() {
  // Keep the model budget short so the route always returns (AI plan or the
  // deterministic fallback) well inside the extension's client timeout. A slow or
  // unsupported structured-output response must never make the whole request fail.
  const value = Number(process.env.AUTOFILL_PLAN_TIMEOUT_MS ?? process.env.OPENROUTER_TIMEOUT_MS ?? 9_000);
  return Number.isFinite(value) && value > 0 ? Math.min(20_000, Math.floor(value)) : 9_000;
}

function autofillModel() {
  return process.env.AUTOFILL_MODEL ?? process.env.OPENROUTER_AUTOFILL_MODEL ?? DEFAULT_AUTOFILL_MODEL;
}

function isField(value: unknown): value is ExtensionAutofillPageField {
  const field = asRecord(value);
  return (
    typeof field.fieldId === "string" &&
    typeof field.label === "string" &&
    typeof field.type === "string" &&
    Array.isArray(field.options) &&
    typeof field.required === "boolean"
  );
}

function sanitizeField(field: ExtensionAutofillPageField): ExtensionAutofillPageField {
  return {
    fieldId: asString(field.fieldId).slice(0, 140),
    label: asString(field.label).slice(0, 240),
    type: field.type,
    required: Boolean(field.required),
    options: field.options.map(asString).filter(Boolean).slice(0, 160),
    optionMode: optionMode(field.optionMode),
    optionDictionary: optionDictionary(field.optionDictionary),
    optionCount:
      typeof field.optionCount === "number" && Number.isFinite(field.optionCount)
        ? Math.max(0, Math.min(10_000, Math.floor(field.optionCount)))
        : null,
    currentValue: asString(field.currentValue).slice(0, 240) || null,
    section: asString(field.section).slice(0, 240) || null,
    repeater: field.repeater === "education" || field.repeater === "experience" ? field.repeater : null,
    repeaterIndex:
      typeof field.repeaterIndex === "number" && Number.isFinite(field.repeaterIndex)
        ? Math.max(0, Math.min(12, Math.floor(field.repeaterIndex)))
        : null,
  };
}

function parsePayload(value: unknown): ExtensionAutofillPlanRequest | null {
  const body = asRecord(value);
  const fields = Array.isArray(body.fields) ? body.fields.filter(isField).map(sanitizeField).slice(0, 140) : [];
  const platform = asString(body.platform);
  const url = asString(body.url);
  if (!platform || !url || fields.length === 0) return null;
  return {
    platform: platform as ExtensionAutofillPlanRequest["platform"],
    url,
    title: asString(body.title).slice(0, 240) || null,
    stepName: asString(body.stepName).slice(0, 180) || null,
    fields,
  };
}

async function loadMasterProfile(args: {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
}): Promise<MasterProfile> {
  const { supabase, user } = args;
  const [
    { data: profileRow, error: profileError },
    { data: answerRows },
    { data: onboardingRow, error: onboardingError },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("profile_answers")
      .select("key,prompt,value")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("onboarding_configurations")
      .select("data,completed_at,updated_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (onboardingError) {
    await reportError("extension autofill onboarding profile fetch failed", onboardingError, { userId: user.id });
  }

  const activeResumeVersionId =
    profileRow &&
    typeof profileRow === "object" &&
    "active_resume_version_id" in profileRow &&
    typeof profileRow.active_resume_version_id === "string"
      ? profileRow.active_resume_version_id
      : "";
  const { data: resumeBase } = await (activeResumeVersionId
    ? supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", user.id)
        .eq("id", activeResumeVersionId)
        .maybeSingle()
    : supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());

  const docs = await findResumeDocuments({ supabase, userId: user.id });
  const [resumeUrl, coverLetterUrl] = await Promise.all([
    signedResumeUrl(supabase, docs.resume?.storage_path),
    signedResumeUrl(supabase, docs.coverLetter?.storage_path),
  ]);

  return buildMasterProfile({
    authEmail: user.email,
    profileRow: asRecord(profileRow),
    resumeContent: resumeBase && typeof resumeBase === "object" && "content" in resumeBase ? resumeBase.content : null,
    answers: Array.isArray(answerRows) ? answerRows : [],
    onboardingData: onboardingRow && typeof onboardingRow === "object" && "data" in onboardingRow ? onboardingRow.data : null,
    resumeUrl,
    resumeName: docs.resume?.display_name ?? null,
    coverLetterUrl,
    coverLetterName: docs.coverLetter?.display_name ?? null,
  });
}

/**
 * Load this user's reusable answers for the current page's questions. Rows live in
 * extension_field_mappings under the "*" platform / plan_answer key namespace, so they
 * are shared across every ATS. Returns live plan items keyed by fieldId.
 */
async function loadCachedPlanItems(args: {
  supabase: SupabaseClient;
  userId: string;
  fields: ExtensionAutofillPageField[];
}) {
  const items = new Map<string, ReturnType<typeof planItemFromCachedAnswer>>();
  const signatureToFields = new Map<string, ExtensionAutofillPageField[]>();
  for (const field of args.fields) {
    const signature = planAnswerSignature(field);
    if (!signature) continue;
    signatureToFields.set(signature, [...(signatureToFields.get(signature) ?? []), field]);
  }
  if (signatureToFields.size === 0) return items;

  const { data, error } = await args.supabase
    .from("extension_field_mappings")
    .select("field_signature,value")
    .eq("user_id", args.userId)
    .eq("platform", PLAN_ANSWER_PLATFORM)
    .eq("canonical_key", PLAN_ANSWER_KEY)
    .in("field_signature", Array.from(signatureToFields.keys()));
  if (error || !Array.isArray(data)) return items;

  for (const row of data) {
    const fields = signatureToFields.get(row.field_signature) ?? [];
    for (const field of fields) {
      const item = planItemFromCachedAnswer(field, row.value);
      if (item) items.set(field.fieldId, item);
    }
  }
  return items;
}

/** Persist AI-planned answers that are safe to replay on future applications. */
async function savePlanAnswers(args: {
  supabase: SupabaseClient;
  userId: string;
  unresolved: ExtensionAutofillPageField[];
  rawPlan: unknown;
  plan: ExtensionAutofillPlan;
}) {
  try {
    const raw = asRecord(args.rawPlan);
    const modelFieldIds = new Set(
      (Array.isArray(raw.fields) ? raw.fields : [])
        .map((item) => asString(asRecord(item).fieldId))
        .filter(Boolean),
    );
    const planById = new Map(args.plan.fields.map((item) => [item.fieldId, item]));
    const now = new Date().toISOString();
    const rows = args.unresolved.flatMap((field) => {
      if (!modelFieldIds.has(field.fieldId)) return [];
      const item = planById.get(field.fieldId);
      if (!item) return [];
      const cacheable = cacheablePlanAnswer(field, item);
      if (!cacheable) return [];
      return [
        {
          user_id: args.userId,
          platform: PLAN_ANSWER_PLATFORM,
          field_signature: cacheable.signature,
          label: field.label.slice(0, 240),
          canonical_key: PLAN_ANSWER_KEY,
          value: cacheable.answer,
          confidence: cacheable.answer.confidence,
          source: "llm",
          updated_at: now,
        },
      ];
    });
    // Two page fields can share one signature (repeated question on the page); keep the last.
    const bySignature = new Map(rows.map((row) => [row.field_signature, row]));
    if (bySignature.size === 0) return;
    await args.supabase
      .from("extension_field_mappings")
      .upsert(Array.from(bySignature.values()), { onConflict: "user_id,platform,field_signature" });
  } catch (error) {
    await reportError("autofill plan answer cache write failed", error, { userId: args.userId });
  }
}

function planMaxTokens(fieldCount: number) {
  // ~140 output tokens per planned field (id, action, value, optionLabel, short note)
  // plus headroom for the summary. Far cheaper than a flat 6000 on small remainders.
  return Math.max(1200, Math.min(6000, 350 + fieldCount * 140));
}

async function callAiPlan(args: {
  payload: ExtensionAutofillPlanRequest;
  fields: ExtensionAutofillPageField[];
  profile: MasterProfile;
}) {
  if (!gatewayConfigured()) return null;

  return callGatewayJSON<Record<string, unknown>>({
    model: autofillModel(),
    timeoutMs: timeoutMs(),
    maxTokens: planMaxTokens(args.fields.length),
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      profile: profileForPrompt(args.profile, args.fields),
      page: {
        platform: args.payload.platform,
        url: args.payload.url,
        title: args.payload.title,
        stepName: args.payload.stepName,
      },
      fields: args.fields,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getExtensionAuthContext(request);
    const body = await request.json().catch(() => null);
    const payload = parsePayload(body);
    if (!payload) return extensionError("Invalid autofill-plan payload.", 400);

    const rateLimit = await checkRateLimit({
      scope: "autofill_plan:user",
      key: user.id,
      ...RATE_LIMITS.fieldMap,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Autofill planning is temporarily rate limited. Try again shortly.");
    }

    const profile = await loadMasterProfile({ supabase, user });
    const fallback = buildFallbackAutofillPlan({
      fields: payload.fields,
      profile,
      stepName: payload.stepName,
    });

    // Replay cached answers for questions this user has answered on earlier
    // applications, but never let a stale cache override a confident profile-derived
    // plan item — the profile is the fresher source.
    const fieldById = new Map(payload.fields.map((field) => [field.fieldId, field]));
    const cachedItems = await loadCachedPlanItems({ supabase, userId: user.id, fields: payload.fields });
    const cachedIds = new Set<string>();
    const baseFields = fallback.fields.map((item) => {
      const field = fieldById.get(item.fieldId);
      const cached = field ? cachedItems.get(field.fieldId) : null;
      if (!field || !cached) return item;
      if (item.action !== "skip" && isConfidentPlanItem(field, item)) return item;
      cachedIds.add(field.fieldId);
      return cached;
    });
    const basePlan = { ...fallback, fields: baseFields };

    const { unresolved } = partitionPlanFields({ fields: payload.fields, plan: basePlan, lockedIds: cachedIds });

    if (unresolved.length === 0) {
      return NextResponse.json({
        ok: true,
        plan: {
          ...basePlan,
          summary:
            cachedIds.size > 0
              ? "Planned from your profile and saved answers — no AI call needed."
              : "Generated a high-confidence deterministic plan.",
        },
      });
    }

    let rawPlan: unknown = null;
    const { shortFields, toOriginal } = withShortFieldIds(unresolved);
    try {
      rawPlan = restorePlanFieldIds(await callAiPlan({ payload, fields: shortFields, profile }), toOriginal);
    } catch (error) {
      await reportError("AI autofill plan failed", error, {
        userId: user.id,
        platform: payload.platform,
        fieldCount: unresolved.length,
      });
    }

    const plan = rawPlan
      ? normalizeAutofillPlan({ raw: rawPlan, fields: payload.fields, fallback: basePlan, stepName: payload.stepName })
      : basePlan;

    if (rawPlan) {
      await savePlanAnswers({ supabase, userId: user.id, unresolved, rawPlan, plan });
    }

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return authErrorResponse(error);
  }
}
