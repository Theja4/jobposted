"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Bot, ListChecks, Loader2 } from "lucide-react";
import type { ApplicationMode } from "@/lib/dashboard/applications";
import { cn } from "@/lib/cn";

const OPTIONS: {
  mode: ApplicationMode;
  label: string;
  hint: string;
  icon: typeof Bot;
}[] = [
  { mode: "auto", label: "Fully automatic", hint: "Sends matched roles for you", icon: Bot },
  { mode: "review", label: "Review queue", hint: "Review each day, one-click apply", icon: ListChecks },
];

export function ModeToggle({ mode: initialMode }: { mode: ApplicationMode }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<ApplicationMode>(initialMode);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function select(next: ApplicationMode) {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; mode?: ApplicationMode; error?: string } | null;
      if (!res.ok || body?.ok !== true || body.mode !== next) {
        setMode(previous);
        setError("Could not save that mode. Try again.");
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setMode(previous);
      setError("Could not save that mode. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="liquid-glass rounded-[1.5rem] p-2 sm:p-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const active = mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => select(option.mode)}
                aria-pressed={active}
                disabled={saving || pending}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors duration-150",
                  active ? "text-white" : "text-ink/70 hover:bg-white/60",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mode-active"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
                    className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(150deg,#1f64e0,#11408f)] shadow-[0_14px_30px_-12px_rgba(31,100,224,0.6)]"
                  />
                )}
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl",
                    active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600",
                  )}
                >
                  {saving && active ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <option.icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    {option.label}
                    {option.mode === "review" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                          active ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700",
                        )}
                      >
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className={cn("block text-xs font-semibold", active ? "text-white/75" : "text-muted")}>
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
    </div>
  );
}
