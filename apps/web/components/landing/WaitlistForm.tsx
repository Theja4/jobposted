"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm({
  className,
  ctaLabel = "Get early access",
  id = "waitlist-email",
  tone = "light",
}: {
  className?: string;
  ctaLabel?: string;
  /** Unique input id — required when the form appears more than once per page. */
  id?: string;
  /** "light" sits on pale surfaces, "glass" sits on saturated blue panels. */
  tone?: "light" | "glass";
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const reduce = useReducedMotion();
  const glass = tone === "glass";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the list, we'll be in touch.");
        track("waitlist_signup", { email_domain: email.split("@")[1] ?? null });
      } else {
        setStatus("error");
        setMessage(data.message || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {status === "success" ? (
          <motion.div
            key="success"
            initial={reduce ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "flex items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-semibold",
              glass
                ? "bg-white/16 text-white ring-1 ring-white/30 ring-inset backdrop-blur-xl"
                : "glass-chip text-brand-800",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full",
                glass ? "bg-white text-brand-700" : "bg-brand-600 text-white",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {message}
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={onSubmit}
            initial={false}
            className="flex flex-col gap-2 sm:flex-row"
            noValidate
          >
            <label htmlFor={id} className="sr-only">
              Email address
            </label>
            <input
              id={id}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              className={cn(
                "h-12 flex-1 rounded-full px-5 text-sm outline-none",
                glass
                  ? "bg-white/14 text-white ring-1 ring-white/35 ring-inset backdrop-blur-xl placeholder:text-white/60 focus:bg-white/20 focus:ring-2 focus:ring-white/80"
                  : "glass-chip text-ink placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500",
              )}
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className={cn(
                "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold whitespace-nowrap",
                "transition-[transform,background-color,box-shadow] duration-150 ease-out",
                "hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-60",
                glass
                  ? "bg-white text-brand-800 shadow-[0_14px_30px_rgba(7,26,51,0.25)] hover:bg-sky-50"
                  : "bg-brand-600 text-white shadow-[0_14px_30px_rgba(31,100,224,0.3)] hover:bg-brand-700 active:bg-brand-800",
              )}
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Joining…
                </>
              ) : (
                <>
                  {ctaLabel} <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {status === "error" && (
        <p
          className={cn("mt-2 text-sm", glass ? "text-amber-200" : "text-red-600")}
          role="alert"
        >
          {message}
        </p>
      )}
    </div>
  );
}
