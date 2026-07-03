import { useEffect, useState } from "react";
import type { ExtensionMessageResponse, ExtensionSettings } from "@jobposted/shared";
import { DEFAULT_EXTENSION_SETTINGS } from "@jobposted/shared";
import { CheckCircle2, MousePointerClick, ShieldCheck } from "lucide-react";

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
    <label className="flex cursor-pointer items-center justify-between gap-6 px-5 py-4">
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[var(--jp-ink)]">{label}</span>
        <span className="mt-0.5 block text-xs font-medium leading-5 text-[var(--jp-muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="jp-switch"
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
    <main className="jp-shell min-h-screen px-5 py-10">
      <div className="mx-auto max-w-[560px] space-y-4">
        <header className="flex items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" className="h-9 w-9 object-contain" />
            <div>
              <h1 className="text-xl font-extrabold tracking-[-0.015em] text-[var(--jp-ink)]">Extension settings</h1>
              <p className="text-[13px] font-medium text-[var(--jp-muted)]">Privacy and fill behavior for JobPosted.</p>
            </div>
          </div>
          <span
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full bg-[#e7f7f0] px-3 py-1.5 text-xs font-bold text-[#0e9f6e] transition-opacity duration-200 ${saved ? "opacity-100" : "opacity-0"}`}
          >
            <CheckCircle2 className="size-4" />
            Saved
          </span>
        </header>

        <section className="jp-card">
          <h2 className="px-5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--jp-muted)]">
            Submission policy
          </h2>
          <div className="flex items-start gap-3.5 px-5 pb-4 pt-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--jp-brand-50)] text-[var(--jp-brand-700)]">
              <MousePointerClick className="size-[18px]" />
            </span>
            <div>
              <span className="block text-[13px] font-bold text-[var(--jp-ink)]">Fill, stop at Submit</span>
              <span className="mt-0.5 block text-xs font-medium leading-5 text-[var(--jp-muted)]">
                JobPosted fills known fields and can move through steps, but you review everything and click the final
                submit button yourself. Always.
              </span>
            </div>
          </div>
        </section>

        <section className="jp-card">
          <h2 className="px-5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--jp-muted)]">
            Privacy and fill behavior
          </h2>
          <div className="divide-y divide-[var(--jp-line)]">
            <Toggle
              label="Fill demographics"
              description="Off by default. Voluntary EEO and self-ID fields are skipped unless you enable this."
              checked={settings.demographicsEnabled}
              onChange={(value) => update({ demographicsEnabled: value })}
            />
            <Toggle
              label="Overwrite filled fields"
              description="When off, JobPosted leaves values you already typed alone."
              checked={settings.overwriteFilledFields}
              onChange={(value) => update({ overwriteFilledFields: value })}
            />
            <Toggle
              label="Generic fallback"
              description="Allow autofill on supported job sites that don't have a dedicated adapter."
              checked={settings.enableGenericFallback}
              onChange={(value) => update({ enableGenericFallback: value })}
            />
            <Toggle
              label="Autofill adds to tracker"
              description="Autofilling a page also records the job in your application tracker."
              checked={settings.autoTrackAutofill}
              onChange={(value) => update({ autoTrackAutofill: value })}
            />
            <Toggle
              label="Auto-advance steps"
              description="Fill & Continue may click Next between steps at a human pace."
              checked={settings.autoAdvance}
              onChange={(value) => update({ autoAdvance: value })}
            />
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl bg-[var(--jp-brand-50)] p-4 text-[13px] font-medium leading-6 text-[var(--jp-ink)]">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--jp-brand-700)]" />
          <p className="m-0">
            No employer, Workday, or LinkedIn passwords are stored. JobPosted only runs inside sessions you already
            opened in Chrome.
          </p>
        </section>
      </div>
    </main>
  );
}
