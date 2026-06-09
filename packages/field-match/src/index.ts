/**
 * @jobposted/field-match — the single internal field-matching service (design doc §11.2).
 * Input is the live form's fields + the user's profile; output is a FieldMap (DATA, not code —
 * the worker and the extension both do the actual filling). Tiered for cost: deterministic
 * standard fields → cheap LLM for custom → vision only for the hard remainder.
 */

import type { FieldMap, FieldMapEntry, OpenEndedAnswer } from "@jobposted/shared";
import { classifyField, standardValue } from "./deterministic";
import { defaultCustomResolver, visionResolveField } from "./llm";
import type {
  CachedStructure,
  FieldMatchInput,
  MatchDeps,
  PageField,
  StandardFieldKind,
} from "./types";

export * from "./types";
export { defaultCustomResolver, visionResolveField } from "./llm";

/** Below this confidence, leave the field for the human rather than guessing (design doc §11.2). */
const REVIEW_THRESHOLD = 0.4;

export async function matchFields(input: FieldMatchInput, deps: MatchDeps = {}): Promise<FieldMap> {
  const resolveCustom = deps.resolveCustom ?? defaultCustomResolver;
  const cached = deps.cache ? await deps.cache.get(input.atsType, input.company) : null;

  const fields: FieldMapEntry[] = [];
  const openEndedAnswers: OpenEndedAnswer[] = [];
  const standardStructure: Record<string, StandardFieldKind> = {};
  const unresolved: PageField[] = [];

  // 1. Deterministic standard fields.
  for (const field of input.fields) {
    const kind = classifyField(field);
    if (kind) {
      standardStructure[field.selector] = kind;
      if (kind === "resume_file" || kind === "cover_letter_file") continue; // worker uploads
      const value = standardValue(kind, input.profile);
      if (value) fields.push({ selector: field.selector, value, type: field.type });
    } else {
      unresolved.push(field);
    }
  }

  // 2. Cheap LLM for custom fields.
  if (unresolved.length > 0) {
    const { fields: resolved, openEnded } = await resolveCustom(unresolved, input);
    const resolvedSelectors = new Set<string>();
    for (const r of resolved) {
      if (r.confidence < REVIEW_THRESHOLD) continue; // flagged for human review
      fields.push({ selector: r.selector, value: r.value, type: r.type });
      resolvedSelectors.add(r.selector);
    }
    for (const oe of openEnded) openEndedAnswers.push(oe);

    // 3. Vision fallback for the hard remainder (only if a screenshot is available).
    if (input.screenshotBase64) {
      for (const field of unresolved) {
        if (resolvedSelectors.has(field.selector)) continue;
        const value = await visionResolveField(field, input);
        if (value) fields.push({ selector: field.selector, value, type: field.type });
      }
    }
  }

  // 4. Persist the form's structure (not answers) for next time.
  if (deps.cache) {
    const custom = input.fields
      .map((f) => f.selector)
      .filter((s) => !(s in standardStructure));
    const structure: CachedStructure = { standard: standardStructure, custom };
    await deps.cache.set(input.atsType, input.company, structure).catch(() => {});
  }
  void cached; // structure-cache currently informs future optimization; see design doc §11.2

  return { fields, openEndedAnswers };
}
