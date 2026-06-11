"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm({
  className,
  ctaLabel = "Get early access",
}: {
  className?: string;
  ctaLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const reduce = useReducedMotion();

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
        setMessage(data.message || "You're on the list — we'll be in touch.");
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
            className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-4 py-3.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200"
          >
            <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-white">
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
            <label htmlFor="waitlist-email" className="sr-only">
              Email address
            </label>
            <input
              id="waitlist-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              className="h-11 flex-1 rounded-xl bg-white px-4 text-sm text-ink ring-1 ring-inset ring-zinc-200 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className={buttonClasses("primary", "md", "shrink-0")}
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
        <p className={cn("mt-2 text-sm text-red-600")} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
