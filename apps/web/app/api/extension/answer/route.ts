import { NextResponse } from "next/server";
import { EXTENSION_ANSWER_TONES, isEligibilityQuestion, type ExtensionAutofillPageField } from "@jobposted/shared";
import { authErrorResponse, extensionError, getExtensionAuthContext } from "@/lib/extension/auth";
import { loadMasterProfile } from "@/lib/extension/profile";
import { profileForPrompt } from "../autofill-plan/planner";
import { callGatewayJSON, gatewayConfigured } from "@/lib/ai/gateway";
import { reportError } from "@/lib/observability/report";
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Model per action. Quick Answer writes from scratch (rewards a stronger writer); Improve It only
// rewrites existing text (a cheaper/faster model is plenty). Both are Foundry deployment names.
const DEFAULT_ANSWER_MODEL = "gpt-5.4-mini";
const DEFAULT_ANSWER_IMPROVE_MODEL = "gpt-5.4-nano";

function answerModel() {
  return process.env.ANSWER_MODEL?.trim() || DEFAULT_ANSWER_MODEL;
}

function answerImproveModel() {
  return process.env.ANSWER_IMPROVE_MODEL?.trim() || DEFAULT_ANSWER_IMPROVE_MODEL;
}

function timeoutMs() {
  const value = Number(process.env.ANSWER_TIMEOUT_MS ?? 20_000);
  return Number.isFinite(value) && value > 0 ? Math.min(28_000, Math.floor(value)) : 20_000;
}

// Only open-ended, experience/motivation questions should be AI-drafted. Eligibility / personal-data
// questions (work authorization, sponsorship, citizenship, salary, EEO) must come from the deterministic
// autofill plan / profile — never free-generated. isEligibilityQuestion is shared with the extension UI
// so the client hides the draft controls for exactly the questions the server refuses.
const ALLOWED_TONES = new Set<string>(EXTENSION_ANSWER_TONES);

const SYSTEM_QUICK = `You draft a job applicant's answer to an open-ended application question, in first person.
Ground every claim ONLY in the supplied profile, experience bullets, skills, and saved answers. Never invent employers, titles, dates, metrics, tools, or projects that are not in the profile.
Keep it brief: 2-4 sentences unless the question clearly needs more. Plain, specific, human — no clichés, no filler, no markdown.
If a "tone" is supplied, write in that tone. If the profile lacks the substance to answer truthfully, return a short honest answer using only what is present; do not fabricate.
Respond with a JSON object: {"answer": string}.`;

const SYSTEM_IMPROVE = `You rewrite a job applicant's draft answer to an application question. Keep it truthful — do not add facts, employers, dates, or metrics that are not already in the draft or the supplied profile.
Apply the requested tone. Keep it concise and human, no markdown. Preserve the original meaning.
Respond with a JSON object: {"answer": string}.`;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function focusField(question: string): ExtensionAutofillPageField {
  return {
    fieldId: "answer",
    label: question,
    type: "textarea",
    options: [],
    optionMode: null,
    required: false,
    section: null,
  };
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getExtensionAuthContext(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return extensionError("Invalid answer payload.", 400);

    const question = asString(body.question);
    if (!question) return extensionError("A question is required.", 400);

    const mode = body.mode === "improve" ? "improve" : "quick";
    const currentText = asString(body.currentText);
    if (mode === "improve" && !currentText) {
      return extensionError("Nothing to improve — provide the current answer text.", 400);
    }

    const requestedTone = asString(body.tone).toLowerCase();
    const tone = ALLOWED_TONES.has(requestedTone) ? requestedTone : "";

    if (isEligibilityQuestion(question)) {
      return extensionError(
        "This looks like an eligibility or personal-data question. Answer it from your profile rather than generating it.",
        422,
      );
    }

    if (!gatewayConfigured()) {
      return extensionError("Answer assistant is not configured.", 503);
    }

    const rateLimit = await checkRateLimit({
      scope: "answer_draft:user",
      key: user.id,
      ...RATE_LIMITS.answerDraft,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Answer drafting is temporarily rate limited. Try again shortly.");
    }

    const profile = await loadMasterProfile({ supabase, user });
    const field = focusField(question);

    const model = mode === "improve" ? answerImproveModel() : answerModel();
    const system = mode === "improve" ? SYSTEM_IMPROVE : SYSTEM_QUICK;
    const user_payload = {
      question,
      tone: tone || null,
      currentText: mode === "improve" ? currentText : null,
      profile: profileForPrompt(profile, [field]),
    };

    let result: { answer?: unknown } | null = null;
    try {
      result = await callGatewayJSON<{ answer?: unknown }>({
        model,
        timeoutMs: timeoutMs(),
        maxTokens: 700,
        temperature: mode === "improve" ? 0.4 : 0.6,
        system,
        user: JSON.stringify(user_payload),
      });
    } catch (error) {
      await reportError("answer draft failed", error, { userId: user.id, mode });
      return extensionError("Could not draft an answer. Please try again.", 502);
    }

    const answer = asString(result?.answer);
    if (!answer) return extensionError("The model returned an empty answer.", 502);

    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    return authErrorResponse(error);
  }
}
