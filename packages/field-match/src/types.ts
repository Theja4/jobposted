import type {
  AtsType,
  FormQuestion,
  FormQuestionType,
  Profile,
} from "@jobposted/shared";

/** A form control discovered on the live page (worker extracts these from the DOM). */
export interface PageField {
  /** CSS selector the worker uses to fill the control. */
  selector: string;
  type: FormQuestionType;
  /** Associated label / aria-label text. */
  label: string;
  /** name or id attribute, when present. */
  name?: string;
  required?: boolean;
  /** Options for select / radio / multiselect. */
  options?: string[];
}

export interface JobContext {
  title?: string;
  company?: string;
  descriptionMd?: string | null;
}

/** Input to the field-matching service (design doc §11.2). */
export interface FieldMatchInput {
  atsType: AtsType;
  company: string;
  /** Form controls extracted from the live page. */
  fields: PageField[];
  profile: Profile;
  /** Known question set from the job (when ingested). */
  formQuestions?: FormQuestion[];
  jobContext?: JobContext;
  /** Base64 screenshot for the vision fallback (optional). */
  screenshotBase64?: string;
}

/**
 * Cached form structure per (ats_type, company) — the classification of which selectors are
 * standard vs custom, so repeat applications skip re-classifying (design doc §11.2). User
 * answers are never cached; only the form's shape.
 */
export interface CachedStructure {
  /** selector → resolution kind for standard fields. */
  standard: Record<string, StandardFieldKind>;
  /** selectors that need per-application resolution (custom questions). */
  custom: string[];
}

export interface FieldMapCacheStore {
  get(atsType: AtsType, company: string): Promise<CachedStructure | null>;
  set(atsType: AtsType, company: string, structure: CachedStructure): Promise<void>;
}

export type StandardFieldKind =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "location"
  | "linkedin"
  | "portfolio"
  | "resume_file"
  | "cover_letter_file";

/** Resolve custom (non-standard) fields with an LLM. Injectable so it can be mocked in tests. */
export type CustomResolver = (
  unresolved: PageField[],
  input: FieldMatchInput,
) => Promise<{ fields: ResolvedField[]; openEnded: { questionId: string; text: string }[] }>;

export interface ResolvedField {
  selector: string;
  value: string;
  type: FormQuestionType;
  /** 0–1; below the review threshold → left for the human, not guessed (design doc §11.2). */
  confidence: number;
}

export interface MatchDeps {
  cache?: FieldMapCacheStore;
  resolveCustom?: CustomResolver;
}
