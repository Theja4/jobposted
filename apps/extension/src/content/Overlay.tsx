import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Pause, Play, ShieldCheck, Wand2, X } from "lucide-react";
import type { ExtensionFieldFillRecord, ExtensionPlatform } from "@jobposted/shared";

export type OverlayRunState = "idle" | "loading" | "filling" | "done" | "error";

export function Overlay({
  platform,
  stepName,
  state,
  fields,
  error,
  onFill,
  onContinue,
  onStop,
  onClose,
}: {
  platform: ExtensionPlatform;
  stepName: string;
  state: OverlayRunState;
  fields: ExtensionFieldFillRecord[];
  error: string | null;
  onFill: () => void;
  onContinue: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const filled = fields.filter((field) => field.status === "filled").length;
  const needsUser = fields.filter((field) => field.status === "needs_user" || field.status === "failed").length;
  const busy = state === "loading" || state === "filling";

  return (
    <div className="fixed right-4 bottom-4 z-[2147483647] w-[min(390px,calc(100vw-32px))] text-[14px]">
      <section className="jp-glass overflow-hidden rounded-[18px]">
        <header className="flex items-center gap-3 border-b border-[rgba(191,219,254,0.7)] px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--jp-brand-600)] text-white">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-[var(--jp-ink)]">
              Autofill with JobPosted
            </p>
            <p className="truncate text-xs font-bold text-[var(--jp-muted)]">
              {platform} · {stepName || "Application"}
            </p>
          </div>
          <button type="button" className="jp-icon-button" aria-label="Close JobPosted" onClick={onClose}>
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 ring-1 ring-inset ring-[var(--jp-border)]">
            <span className="inline-flex items-center gap-2 text-xs font-black text-[var(--jp-brand-700)]">
              <ShieldCheck className="size-4" />
              Review before submit
            </span>
            <span className="text-xs font-bold text-[var(--jp-muted)]">
              {fields.length ? `${filled}/${fields.length} filled` : "Ready"}
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-[#fff7ed] px-3 py-2 text-xs font-semibold text-[#9a3412] ring-1 ring-inset ring-[#fed7aa]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {fields.length > 0 && (
            <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
              {fields.slice(-10).map((field) => (
                <div key={field.signature + field.label} className="flex items-center gap-2 rounded-xl bg-white/65 px-3 py-2">
                  <span
                    className={
                      "grid size-5 shrink-0 place-items-center rounded-full " +
                      (field.status === "filled"
                        ? "bg-emerald-50 text-emerald-700"
                        : field.status === "failed" || field.status === "needs_user"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-zinc-100 text-zinc-500")
                    }
                  >
                    {field.status === "filled" ? <CheckCircle2 className="size-3.5" /> : <Pause className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-[var(--jp-ink)]">{field.label}</p>
                    <p className="truncate text-[11px] font-semibold text-[var(--jp-muted)]">
                      {field.canonicalKey}
                      {field.error ? ` · ${field.error}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {needsUser > 0 && (
            <p className="text-xs font-semibold leading-5 text-[var(--jp-muted)]">
              {needsUser} field{needsUser === 1 ? "" : "s"} need review. They are highlighted on the page.
            </p>
          )}

          <div className="grid grid-cols-[1fr_1.15fr] gap-2">
            <button type="button" className="jp-button jp-button-secondary" disabled={busy} onClick={onFill}>
              <Play className="size-4" />
              Fill
            </button>
            <button type="button" className="jp-button jp-button-primary" disabled={busy} onClick={onContinue}>
              Fill & Continue
              <ChevronRight className="size-4" />
            </button>
          </div>
          {busy && (
            <button type="button" className="w-full text-center text-xs font-bold text-[var(--jp-muted)]" onClick={onStop}>
              Stop after this field
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
