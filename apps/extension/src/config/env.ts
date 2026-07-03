export const JOBPOSTED_WEB_ORIGIN: string =
  import.meta.env.WXT_JOBPOSTED_WEB_ORIGIN || "https://jobposted.app";

// Rezoomed shares this project's Supabase, so "Edit in Rezoomed" just deep-links into
// its builder-import route with the tailored resume's doc id.
export const REZOOMED_WEB_ORIGIN: string =
  import.meta.env.WXT_REZOOMED_WEB_ORIGIN || "https://www.rezoomed.com";
export const REZOOMED_BUILDER_IMPORT_PATH = "/dashboard/builder/import";

export const SUPABASE_URL: string = import.meta.env.WXT_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY: string = import.meta.env.WXT_SUPABASE_ANON_KEY || "";

// Publishable logo.dev key, baked at build time. Client-safe. Used to render
// real company logos in the panel via logo.dev's image API.
export const LOGO_DEV_TOKEN: string = import.meta.env.WXT_LOGO_DEV_TOKEN || "";

export const EXTENSION_BRIDGE_PATH = "/extension/bridge";

export const API_PROFILE_PATH = "/api/extension/profile";
export const API_SESSION_PATH = "/api/extension/session";
export const API_RESUME_PATH = "/api/extension/resume";
export const API_APPLICATIONS_PATH = "/api/extension/applications";
export const API_RESUMES_PATH = "/api/extension/resumes";
export const API_ANSWERS_PATH = "/api/extension/answers";
export const API_FIELD_MAP_PATH = "/api/extension/field-map";
export const API_AUTOFILL_PLAN_PATH = "/api/extension/autofill-plan";
export const API_TAILOR_PATH = "/api/extension/tailor";
export const API_COVER_LETTER_PATH = "/api/extension/cover-letter";
