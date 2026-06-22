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
import type { AutofillResult, PlatformAdapter } from "./types";

function runtimeMessage<T extends ExtensionMessageResponse>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export function humanDelay(settings: ExtensionSettings) {
  const [min, max] =
    settings.humanPace === "fast"
      ? [80, 190]
      : settings.humanPace === "careful"
        ? [260, 680]
        : [150, 380];
  return new Promise((resolve) => window.setTimeout(resolve, min + Math.random() * (max - min)));
}

export async function fillCurrentStep(args: {
  adapter: PlatformAdapter;
  profile: MasterProfile;
  settings: ExtensionSettings;
  onField: (record: ExtensionFieldFillRecord) => void;
}): Promise<AutofillResult> {
  const { adapter, profile, settings, onField } = args;
  const step = adapter.detectStep(document);
  const hints = adapter.mapFields(document);
  const fields = extractFields(document, adapter.id, hints);
  const records: ExtensionFieldFillRecord[] = [];

  for (const field of fields) {
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
      getResume: async () => {
        const response = await runtimeMessage<ExtensionMessageResponse>({
          type: "RESUME_GET",
          jobId: null,
        });
        return response.ok && response.type === "RESUME_GET"
          ? {
              resumeUrl: response.resume.resumeUrl,
              coverLetterUrl: response.resume.coverLetterUrl ?? null,
            }
          : { resumeUrl: profile.documents.resumeUrl ?? null, coverLetterUrl: profile.documents.coverLetterUrl };
      },
    };
    const record = await fillField(field, mapping, fillContext);
    records.push(record);
    onField(record);
    await humanDelay(settings);
  }

  const fallbackRecords = await fillWorkAuthFallbacks({
    profile,
    platform: adapter.id,
    url: window.location.href,
    demographicsEnabled: settings.demographicsEnabled,
    context: {
      profile,
      platform: adapter.id,
      url: window.location.href,
      overwrite: settings.overwriteFilledFields,
      demographicsEnabled: settings.demographicsEnabled,
      onField,
      llmMap: async () => null,
      getResume: async () => ({ resumeUrl: profile.documents.resumeUrl ?? null, coverLetterUrl: profile.documents.coverLetterUrl ?? null }),
    },
    existingRecords: records,
  });
  for (const record of fallbackRecords) {
    records.push(record);
    onField(record);
    await humanDelay(settings);
  }

  await adapter.fillExtras?.({
    profile,
    platform: adapter.id,
    url: window.location.href,
    overwrite: settings.overwriteFilledFields,
    demographicsEnabled: settings.demographicsEnabled,
    onField,
    llmMap: async () => null,
    getResume: async () => ({ resumeUrl: profile.documents.resumeUrl ?? null }),
  });

  return {
    platform: adapter.id,
    stepName: step.name,
    fields: records,
    filled: records.filter((record) => record.status === "filled").length,
    total: records.length,
  };
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
