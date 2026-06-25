import { NextResponse } from "next/server";
import type { ExtensionAutofillPageField, ExtensionAutofillPlanRequest, MasterProfile } from "@jobposted/shared";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { buildMasterProfile } from "@/lib/extension/profile";
import { findResumeDocuments, signedResumeUrl } from "@/lib/extension/resume";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import {
  buildFallbackAutofillPlan,
  canSkipMercuryForPlan,
  normalizeAutofillPlan,
  profileForPrompt,
} from "./planner";

export const runtime = "nodejs";
// Without this, Vercel kills the function at the platform default (~10-15s) and
// the extension sees a 504/abort instead of the plan or its fallback.
export const maxDuration = 30;

const MERCURY_MODEL = "inception/mercury-2";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = `You are JobPosted's application-form autofill planner.
Return only JSON matching the schema. Plan one action per supplied fieldId.
Use the applicant profile and saved answers. Never submit the form.
Every field has a "type" and an "options" array. For any select, radio, combobox, typeahead, or multiselect field, return action "select"; never return action "fill" for a dropdown-like field. If optionMode is missing or "full", the supplied options are complete: choose ONLY from those options using their exact text (put it in optionLabel) — never write a country, city, name, date, or other free text into a complete choice field.
If optionMode is "local_dictionary" or "ranked_subset", the options array is intentionally omitted or partial to reduce tokens. In that case, use the label, optionDictionary, profile, and shown candidates to return the desired real-world value (for example "+91" or "India") and set optionLabel only when one of the supplied candidate options is the exact option to select; the extension will match the full local DOM list.
When a form has a separate phone country/calling-code dropdown and a Phone input, select the calling-code option in the dropdown and put only the national phone number in the Phone input.
For Yes/No questions (work authorization, sponsorship, "have you worked here before", age eligibility) answer exactly "Yes" or "No" to match the options — never a country or other text.
For multiselect "select all that apply" fields, set "value" to an array of the applicable option texts; for sanctions, export-control, or citizenship questions default to ["None of the above"] (or ["Not applicable"]) unless the profile clearly indicates otherwise.
Use closest-option matching when exact select/radio/combobox choices are absent.
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
  // Keep the model budget short so the route always returns (Mercury plan or the
  // deterministic fallback) well inside the extension's client timeout. A slow or
  // unsupported structured-output response must never make the whole request fail.
  const value = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 9_000);
  return Number.isFinite(value) && value > 0 ? Math.min(20_000, Math.floor(value)) : 9_000;
}

function parsePlanContent(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(trimmed);
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

async function callMercuryPlan(args: {
  payload: ExtensionAutofillPlanRequest;
  profile: MasterProfile;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(`${(process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://jobposted.app",
        "X-OpenRouter-Title": "JobPosted",
      },
      body: JSON.stringify({
        model: MERCURY_MODEL,
        stream: false,
        temperature: 0.1,
        max_tokens: 6000,
        // json_object is universally + quickly supported across OpenRouter models;
        // strict json_schema is not, and was a likely source of the long hang.
        // normalizeAutofillPlan re-validates the shape regardless.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              profile: profileForPrompt(args.profile),
              page: {
                platform: args.payload.platform,
                url: args.payload.url,
                title: args.payload.title,
                stepName: args.payload.stepName,
              },
              fields: args.payload.fields,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter responded ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned an empty autofill plan.");
    return parsePlanContent(content);
  } finally {
    clearTimeout(timeout);
  }
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

    if (canSkipMercuryForPlan({ fields: payload.fields, plan: fallback })) {
      return NextResponse.json({
        ok: true,
        plan: {
          ...fallback,
          summary: "Generated a high-confidence deterministic plan.",
        },
      });
    }

    let rawPlan: unknown = null;
    try {
      rawPlan = await callMercuryPlan({ payload, profile });
    } catch (error) {
      await reportError("Mercury autofill plan failed", error, {
        userId: user.id,
        platform: payload.platform,
        fieldCount: payload.fields.length,
      });
    }

    const plan = rawPlan
      ? normalizeAutofillPlan({ raw: rawPlan, fields: payload.fields, fallback, stepName: payload.stepName })
      : fallback;

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return authErrorResponse(error);
  }
}
