import type {
  ExtensionFieldFillRecord,
  ExtensionFieldMapping,
  ExtensionMessageResponse,
  ExtensionPlatform,
  ExtensionSettings,
  MasterProfile,
} from "@jobposted/shared";
import { fillField } from "./fill";
import { extractFields } from "./extract";
import { resolveField, toFieldContext } from "./resolve";
import { fillWorkAuthFallbacks } from "./work-auth-fallback";
import type { AutofillResult, FieldDescriptor, PlatformAdapter } from "./types";

function runtimeMessage<T extends ExtensionMessageResponse>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export function humanDelay(settings: ExtensionSettings, shouldStop?: () => boolean) {
  const [min, max] =
    settings.humanPace === "fast"
      ? [80, 190]
      : settings.humanPace === "careful"
        ? [260, 680]
        : [150, 380];
  const duration = min + Math.random() * (max - min);
  if (!shouldStop) return new Promise((resolve) => window.setTimeout(resolve, duration));
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (shouldStop() || Date.now() - startedAt >= duration) {
        resolve(undefined);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function delay(ms: number, shouldStop?: () => boolean) {
  if (!shouldStop) return new Promise((resolve) => window.setTimeout(resolve, ms));
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (shouldStop() || Date.now() - startedAt >= ms) {
        resolve(undefined);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function currentFields(adapter: PlatformAdapter) {
  return extractFields(document, adapter.id, adapter.mapFields(document));
}

async function fieldsWhenReady(adapter: PlatformAdapter, shouldStop?: () => boolean) {
  let fields = currentFields(adapter);
  if (fields.length > 0) return fields;
  const startedAt = Date.now();
  while (!shouldStop?.() && Date.now() - startedAt < 2500) {
    await delay(200, shouldStop);
    fields = currentFields(adapter);
    if (fields.length > 0) return fields;
  }
  return fields;
}

export async function fillCurrentStep(args: {
  adapter: PlatformAdapter;
  profile: MasterProfile;
  settings: ExtensionSettings;
  onField: (record: ExtensionFieldFillRecord) => void;
  onFieldsDiscovered?: (fields: FieldDescriptor[]) => void;
  onFieldStart?: (field: FieldDescriptor) => void;
  shouldStop?: () => boolean;
}): Promise<AutofillResult> {
  const { adapter, profile, settings, onField, shouldStop } = args;
  const step = adapter.detectStep(document);
  const fields = adapter.fillExtras ? currentFields(adapter) : await fieldsWhenReady(adapter, shouldStop);
  const records: ExtensionFieldFillRecord[] = [];
  const getResume = async () => {
    const response = await runtimeMessage<ExtensionMessageResponse>({
      type: "RESUME_GET",
      jobId: null,
    });
    return response.ok && response.type === "RESUME_GET"
      ? {
          resumeUrl: response.resume.resumeUrl,
          resumeName: response.resume.resumeName ?? null,
          coverLetterUrl: response.resume.coverLetterUrl ?? null,
          coverLetterName: response.resume.coverLetterName ?? null,
        }
      : {
          resumeUrl: profile.documents.resumeUrl ?? null,
          resumeName: profile.documents.resumeName ?? null,
          coverLetterUrl: profile.documents.coverLetterUrl,
          coverLetterName: profile.documents.coverLetterName ?? null,
        };
  };
  args.onFieldsDiscovered?.(fields);

  for (const field of fields) {
    if (shouldStop?.()) break;
    args.onFieldStart?.(field);
    const record = await fillSingleField({
      adapter,
      profile,
      settings,
      field,
      onField,
      shouldStop,
    });
    records.push(record);
    await humanDelay(settings, shouldStop);
  }

  if (shouldStop?.()) {
    return {
      platform: adapter.id,
      stepName: step.name,
      fields: records,
      filled: records.filter((record) => record.status === "filled").length,
      total: records.length,
    };
  }

  const fallbackContext = {
    profile,
    platform: adapter.id,
    url: window.location.href,
    overwrite: settings.overwriteFilledFields,
    demographicsEnabled: settings.demographicsEnabled,
    onField,
    llmMap: async () => null,
    shouldStop,
    getResume,
  };
  const fallbackRecords = await fillWorkAuthFallbacks({
    profile,
    platform: adapter.id,
    url: window.location.href,
    demographicsEnabled: settings.demographicsEnabled,
    context: fallbackContext,
    existingRecords: records,
  });
  for (const record of fallbackRecords) {
    if (shouldStop?.()) break;
    records.push(record);
    onField(record);
    await humanDelay(settings, shouldStop);
  }

  if (shouldStop?.()) {
    return {
      platform: adapter.id,
      stepName: step.name,
      fields: records,
      filled: records.filter((record) => record.status === "filled").length,
      total: records.length,
    };
  }

  const extraRecords: ExtensionFieldFillRecord[] = [];
  await adapter.fillExtras?.({
    profile,
    platform: adapter.id,
    url: window.location.href,
    overwrite: settings.overwriteFilledFields,
    demographicsEnabled: settings.demographicsEnabled,
    onField: (record) => {
      extraRecords.push(record);
      onField(record);
    },
    llmMap: async () => null,
    shouldStop,
    getResume,
  });
  records.push(...extraRecords);

  return {
    platform: adapter.id,
    stepName: step.name,
    fields: records,
    filled: records.filter((record) => record.status === "filled").length,
    total: records.length,
  };
}

export async function fillSingleField(args: {
  adapter: PlatformAdapter;
  profile: MasterProfile;
  settings: ExtensionSettings;
  field: FieldDescriptor;
  onField: (record: ExtensionFieldFillRecord) => void;
  shouldStop?: () => boolean;
}) {
  const { adapter, profile, settings, field, onField, shouldStop } = args;
  const mapping = await resolveField({
    field,
    profile,
    platform: adapter.id,
    url: window.location.href,
    demographicsEnabled: settings.demographicsEnabled,
    llmMap: async (candidate) => {
      if (!candidate.required) return null;
      const response = await runtimeMessage<ExtensionMessageResponse>({
        type: "FIELD_MAP",
        field: toFieldContext(candidate, adapter.id, window.location.href),
        profile,
      });
      return response.ok && response.type === "FIELD_MAP" ? response.mapping : null;
    },
  });

  const fillContext = {
    profile,
    platform: adapter.id,
    url: window.location.href,
    overwrite: settings.overwriteFilledFields,
    demographicsEnabled: settings.demographicsEnabled,
    onField,
    llmMap: async () => null,
    shouldStop,
    getResume: async () => {
      const response = await runtimeMessage<ExtensionMessageResponse>({
        type: "RESUME_GET",
        jobId: null,
      });
      return response.ok && response.type === "RESUME_GET"
        ? {
            resumeUrl: response.resume.resumeUrl,
            resumeName: response.resume.resumeName ?? null,
            coverLetterUrl: response.resume.coverLetterUrl ?? null,
            coverLetterName: response.resume.coverLetterName ?? null,
          }
        : {
            resumeUrl: profile.documents.resumeUrl ?? null,
            resumeName: profile.documents.resumeName ?? null,
            coverLetterUrl: profile.documents.coverLetterUrl,
            coverLetterName: profile.documents.coverLetterName ?? null,
          };
    },
  };
  const record = await fillField(field, mapping, fillContext);
  onField(record);
  return record;
}

export function applicationMetadata(platform: ExtensionPlatform) {
  const title = document.title.replace(/\s+/g, " ").trim();
  const heading =
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector("[data-automation-id='jobPostingHeader']")?.textContent?.trim() ||
    title;
  const company =
    document.querySelector("[data-automation-id='company']")?.textContent?.trim() ||
    document.querySelector("[class*='company']")?.textContent?.trim() ||
    title.split("|").at(-1)?.trim() ||
    "Unknown company";
  return {
    source: "extension" as const,
    platform,
    company,
    role: heading || "Unknown role",
    jobUrl: window.location.href,
  };
}
