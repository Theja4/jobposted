import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Profile } from "@jobposted/shared";
import type { CustomResolver, FieldMatchInput, PageField, ResolvedField } from "./types";

// Match Rezoomed's OpenRouter setup (lib/claude.ts): deepseek-v4-flash + attribution headers.
const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek/deepseek-v4-flash";
const OPENROUTER_HEADERS = {
  "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://jobposted.app",
  "X-Title": "JobPosted",
};
const CLAUDE_VISION_MODEL = process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-5";

/** Compact, truthful profile context for answering ATS questions. */
function profileBrief(p: Profile): string {
  return [
    `Name: ${p.fullName ?? "—"}`,
    `Location: ${p.location ?? "—"}`,
    `Work authorization: ${p.workAuthorization ?? "—"}`,
    `Needs visa sponsorship: ${p.needsSponsorship ? "yes" : "no"}`,
    `Open to relocation: ${p.relocationOk ? "yes" : "no"}`,
    p.salaryExpectationMin != null
      ? `Salary expectation: ${p.salaryExpectationMin}-${p.salaryExpectationMax ?? ""} ${p.salaryCurrency ?? ""}`
      : "Salary expectation: —",
    p.noticePeriodDays != null ? `Notice period: ${p.noticePeriodDays} days` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface RawAnswer {
  selector: string;
  value: string;
  openEnded?: boolean;
  confidence?: number;
}

function safeParse(text: string): RawAnswer[] {
  try {
    const json = JSON.parse(text) as { answers?: RawAnswer[] };
    return Array.isArray(json.answers) ? json.answers : [];
  } catch {
    return [];
  }
}

/**
 * Default LLM resolver for custom fields (design doc §11.2): cheap model (DeepSeek via
 * OpenRouter) answers plain selects/short text and drafts open-ended answers in the user's
 * voice, truthful to the profile. No key → returns nothing (all flagged for human review).
 */
export const defaultCustomResolver: CustomResolver = async (unresolved, input) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || unresolved.length === 0) return { fields: [], openEnded: [] };

  const client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE, defaultHeaders: OPENROUTER_HEADERS });
  const system =
    "You fill job-application form fields from a candidate profile. Answer ONLY from the " +
    "provided profile and job context. Never invent facts. For select/radio fields choose " +
    "exactly one of the given options. For open-ended questions write a brief, specific answer " +
    "in the candidate's voice. If you cannot answer truthfully, omit that field. Respond as " +
    'JSON: {"answers":[{"selector","value","openEnded":bool,"confidence":0..1}]}.';

  const fieldsDesc = unresolved
    .map((f, i) => {
      const opts = f.options?.length ? ` options=[${f.options.join(" | ")}]` : "";
      return `${i + 1}. selector="${f.selector}" type=${f.type} label="${f.label}"${opts}`;
    })
    .join("\n");

  const user =
    `CANDIDATE PROFILE:\n${profileBrief(input.profile)}\n\n` +
    `JOB: ${input.jobContext?.title ?? ""} at ${input.jobContext?.company ?? input.company}\n\n` +
    `FIELDS TO ANSWER:\n${fieldsDesc}`;

  let answers: RawAnswer[] = [];
  try {
    const res = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    answers = safeParse(res.choices[0]?.message?.content ?? "");
  } catch (err) {
    console.error("[field-match] DeepSeek resolve failed:", (err as Error).message);
    return { fields: [], openEnded: [] };
  }

  const bySelector = new Map(unresolved.map((f) => [f.selector, f]));
  const fields: ResolvedField[] = [];
  const openEnded: { questionId: string; text: string }[] = [];
  for (const a of answers) {
    const f = bySelector.get(a.selector);
    if (!f || !a.value) continue;
    fields.push({ selector: a.selector, value: a.value, type: f.type, confidence: a.confidence ?? 0.7 });
    if (a.openEnded) openEnded.push({ questionId: f.label || f.selector, text: a.value });
  }
  return { fields, openEnded };
};

/**
 * Vision fallback (design doc §11.1): resolve a single hard/unlabeled field from a screenshot
 * with Claude. Used only when the cheap pass can't resolve it. No key → null.
 */
/** Trips after the first auth/credit/quota failure so we don't hammer a dead key all run. */
let visionDisabled = false;

export async function visionResolveField(
  field: PageField,
  input: FieldMatchInput,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.screenshotBase64 || visionDisabled) return null;

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: input.screenshotBase64 },
            },
            {
              type: "text",
              text:
                `From this application form and the candidate profile below, give ONLY the value ` +
                `for the field labeled "${field.label}". If unknown or not truthfully answerable, ` +
                `reply exactly "UNKNOWN".\n\nPROFILE:\n${profileBrief(input.profile)}`,
            },
          ],
        },
      ],
    });
    const text = msg.content.find((c) => c.type === "text");
    const value = text && "text" in text ? text.text.trim() : "";
    return value && value !== "UNKNOWN" ? value : null;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 401 || status === 403 || status === 429) {
      visionDisabled = true; // credit/auth/quota — stop retrying for the rest of this run
      console.error(`[field-match] Claude vision disabled for this run (HTTP ${status}).`);
    } else {
      console.error("[field-match] Claude vision failed:", (err as Error).message);
    }
    return null;
  }
}
