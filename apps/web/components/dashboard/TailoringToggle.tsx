"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";

const OPTIONS = [
  {
    value: true,
    label: "Tailor resumes",
    hint: "Rewrite each resume for the role",
    icon: Wand2,
  },
  {
    value: false,
    label: "Use master resume",
    hint: "Send the active resume as-is",
    icon: FileText,
  },
];

export function TailoringToggle({ tailorResume: initial }: { tailorResume: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [tailorResume, setTailorResume] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTailorResume(initial);
  }, [initial]);

  async function select(next: boolean) {
    if (next === tailorResume || saving) return;
    const previous = tailorResume;
    setTailorResume(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/tailoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tailorResume: next }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; tailorResume?: boolean } | null;
      if (!res.ok || body?.ok !== true || body.tailorResume !== next) {
        setTailorResume(previous);
        setError("Could not save that resume setting. Try again.");
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setTailorResume(previous);
      setError("Could not save that resume setting. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="liquid-glass rounded-[1.5rem] p-2 sm:p-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const active = tailorResume === option.value;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => select(option.value)}
                aria-pressed={active}
                disabled={saving || pending}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors duration-150",
                  active ? "text-white" : "text-ink/70 hover:bg-white/60",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tailoring-active"
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
                  {saving && active ? <Loader2 className="size-4 animate-spin" /> : <option.icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{option.label}</span>
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
