import { useEffect, useState } from "react";
import type { ExtensionMessageResponse, ExtensionSettings } from "@jobposted/shared";
import { DEFAULT_EXTENSION_SETTINGS } from "@jobposted/shared";
import { CheckCircle2, ShieldCheck } from "lucide-react";

function send<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-5 rounded-[14px] bg-white/75 px-4 py-3 ring-1 ring-inset ring-[var(--jp-border)]">
      <span>
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--jp-muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-5 w-5 accent-[var(--jp-brand-600)]"
      />
    </label>
  );
}

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_EXTENSION_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void send<ExtensionMessageResponse>({ type: "SETTINGS_GET" }).then((response) => {
      if (response.ok && response.type === "SETTINGS_GET") setSettings(response.settings);
    });
  }, []);

  async function update(partial: Partial<ExtensionSettings>) {
    const response = await send<ExtensionMessageResponse>({ type: "SETTINGS_SET", settings: partial });
    if (response.ok && response.type === "SETTINGS_SET") {
      setSettings(response.settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    }
  }

  return (
    <main className="jp-shell min-h-screen px-5 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" className="h-11 w-11 object-contain" />
            <div>
              <h1 className="text-2xl font-black tracking-[-0.02em]">JobPosted extension options</h1>
              <p className="text-sm font-semibold text-[var(--jp-muted)]">Control privacy and platform behavior.</p>
            </div>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="size-4" />
              Saved
            </span>
          )}
        </header>

        <section className="jp-glass rounded-[18px] p-5">
          <h2 className="text-base font-black">Submission policy</h2>
          <div className="mt-3 rounded-[14px] bg-white/75 px-4 py-3 ring-1 ring-inset ring-[var(--jp-border)]">
            <span className="block text-sm font-black">Fill, stop at Submit</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--jp-muted)]">
              JobPosted can fill known fields and move through steps, but you upload documents and click the final submit button.
            </span>
          </div>
        </section>

        <section className="jp-glass space-y-3 rounded-[18px] p-5">
          <h2 className="text-base font-black">Privacy and fill behavior</h2>
          <Toggle
            label="Fill demographics"
            description="Off by default. Voluntary EEO/self-ID fields are skipped unless enabled."
            checked={settings.demographicsEnabled}
            onChange={(value) => update({ demographicsEnabled: value })}
          />
          <Toggle
            label="Overwrite filled fields"
            description="When off, JobPosted leaves existing values alone."
            checked={settings.overwriteFilledFields}
            onChange={(value) => update({ overwriteFilledFields: value })}
          />
          <Toggle
            label="Generic fallback"
            description="Allow heuristic autofill on supported hosts without a specific adapter."
            checked={settings.enableGenericFallback}
            onChange={(value) => update({ enableGenericFallback: value })}
          />
          <Toggle
            label="Autofill adds to tracker"
            description="When on, Auto-fill this page also records the job in Application history."
            checked={settings.autoTrackAutofill}
            onChange={(value) => update({ autoTrackAutofill: value })}
          />
          <Toggle
            label="Auto-advance steps"
            description="Fill & Continue can click Next/Continue at a human pace."
            checked={settings.autoAdvance}
            onChange={(value) => update({ autoAdvance: value })}
          />
        </section>

        <section className="flex items-start gap-3 rounded-[16px] bg-[var(--jp-brand-50)] p-4 text-sm leading-6 text-[var(--jp-ink)] ring-1 ring-inset ring-[var(--jp-brand-100)]">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--jp-brand-700)]" />
          No employer, Workday, or LinkedIn passwords are stored. JobPosted only runs inside sessions you already opened in Chrome.
        </section>
      </div>
    </main>
  );
}
