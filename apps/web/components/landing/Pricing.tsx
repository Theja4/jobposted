"use client";

import Image from "next/image";
import type {
  BillingPlanId,
  BillingPricingView,
  BillingRegion,
  BillingTenure,
} from "@/lib/billing/plans";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { SUPPORT_EMAIL } from "@/lib/site";

type PricingProps = {
  pricing: BillingPricingView;
  authNextPath?: string;
};

const INCLUSIONS = [
  "Job board curated from the top 80 ATS systems",
  "A tailored resume for every role",
  "Application form autofill",
  "Job tracker",
] as const;

export function Pricing({ pricing, authNextPath = "/pricing" }: PricingProps) {
  const [tenure, setTenure] = useState<BillingTenure>("monthly");
  const selected = useMemo(
    () => pricing.options.find((option) => option.tenure === tenure) ?? pricing.options[0]!,
    [pricing.options, tenure],
  );
  const plan = BILLING_PLANS[pricing.planId];
  const reduceMotion = useReducedMotion();

  return (
    <section id="pricing" className="relative px-5 pb-8 pt-10 sm:pb-12 sm:pt-12 lg:pt-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid items-end gap-5 border-b border-zinc-200 pb-7 sm:pb-8 lg:grid-cols-[1fr_25rem] lg:gap-12">
          <div>
            <p className="text-sm font-semibold text-brand-700">JobPosted membership</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[0.98] tracking-[-0.04em] text-balance text-ink sm:text-5xl lg:text-[4.25rem]">
              Apply better.<br />Not everywhere.
            </h1>
          </div>
          <p className="max-w-[38rem] text-base leading-7 text-muted lg:pb-1">
            One plan for a focused job search. We prepare the application; you review it before
            anything is submitted.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="border-b border-zinc-200 py-8 lg:border-b-0 lg:border-r lg:py-9 lg:pr-10">
            <a
              href="/upgrade"
              className="group relative isolate flex min-h-44 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#071a33_0%,#123765_52%,#1f64e0_100%)] p-6 text-white shadow-[0_22px_60px_rgba(31,100,224,0.2)] transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-48 sm:p-7"
            >
              <div className="relative z-10 max-w-[72%] sm:max-w-[68%]">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-white/90 uppercase backdrop-blur-sm">
                  Rezoomed Pro benefit
                </span>
                <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-[-0.035em] sm:text-3xl">
                  JobPosted is included with Rezoomed Pro.
                </h2>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-white">
                  Click here to learn more
                  <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>

              <div className="absolute -right-5 -bottom-8 size-40 rotate-[-5deg] rounded-[2.25rem] bg-white/12 p-3 shadow-2xl ring-1 ring-white/20 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-0 sm:-right-2 sm:-bottom-8 sm:size-48">
                <Image
                  src="/rezoomed/logo.png"
                  alt="Rezoomed"
                  width={256}
                  height={256}
                  className="size-full rounded-[1.7rem] object-cover"
                />
              </div>
              <span className="pointer-events-none absolute -top-24 left-1/3 size-64 rounded-full bg-brand-400/20 blur-3xl" />
            </a>

            <div className="mt-8 flex items-baseline justify-between gap-6">
              <h2 className="text-2xl font-bold tracking-[-0.025em] text-ink">What’s included</h2>
              <span className="hidden text-sm font-medium text-muted sm:block">Every membership</span>
            </div>

            <ul className="mt-5 border-t border-zinc-200">
              {INCLUSIONS.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-4 border-b border-zinc-200 py-4 text-base font-semibold text-ink sm:text-lg"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                  <span>{item}</span>
                  <span className="ml-auto text-sm font-medium tabular-nums text-zinc-400">
                    0{index + 1}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex max-w-2xl items-start gap-4">
              <ShieldCheck className="mt-0.5 size-6 shrink-0 text-brand-700" />
              <div>
                <h3 className="font-bold text-ink">Copilot, not autopilot.</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  JobPosted can match, tailor, and fill. The final submit stays with you.
                </p>
              </div>
            </div>
          </div>

          <aside className="order-first py-8 lg:order-none lg:py-9 lg:pl-10" aria-label="Choose billing schedule">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-muted">{plan.label}</p>
                <h2 className="mt-1 text-xl font-bold text-ink">Choose your billing</h2>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                {pricing.currencyCode}
              </span>
            </div>

            <div className="mt-5 border-y border-zinc-200">
              {pricing.options.map((option) => {
                const active = tenure === option.tenure;
                return (
                  <button
                    key={option.tenure}
                    type="button"
                    onClick={() => setTenure(option.tenure)}
                    aria-pressed={active}
                    className={cn(
                      "group flex w-full items-center gap-3 border-b border-zinc-200 px-1 py-4 text-left last:border-b-0",
                      "transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-offset-4",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                        active ? "border-brand-600 bg-brand-600" : "border-zinc-300 bg-white",
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full bg-white", !active && "opacity-0")} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">{option.label}</span>
                      <span className="block text-xs font-medium text-muted">
                        {option.highlighted
                          ? "Lower cost over three months"
                          : "Pay one month at a time"}
                      </span>
                    </span>
                    <span className="ml-auto text-right">
                      <span className="block text-lg font-extrabold tabular-nums text-ink">
                        {option.priceLabel}
                      </span>
                      <span className="block text-xs font-medium text-muted">{option.cadence}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 min-h-16">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${selected.tenure}-${selected.priceLabel}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-extrabold tracking-[-0.035em] tabular-nums text-ink">
                      {selected.priceLabel}
                    </span>
                    <span className="pb-1 text-sm font-medium text-muted">{selected.cadence}</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <PlanCheckoutButton
              planId={pricing.planId}
              tenure={selected.tenure}
              region={pricing.region}
              currencyCode={pricing.currencyCode}
              authNextPath={authNextPath}
            />

            <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-muted">
              <LockKeyhole className="size-3.5" />
              Secure checkout.
            </p>
          </aside>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 py-7 text-sm text-muted sm:flex-row sm:items-center sm:justify-end">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-ink underline decoration-zinc-300 underline-offset-4 hover:decoration-brand-600"
          >
            Questions? Talk to us.
          </a>
        </div>
      </div>
    </section>
  );
}

function PlanCheckoutButton({
  planId,
  tenure,
  region,
  currencyCode,
  authNextPath,
}: {
  planId: BillingPlanId;
  tenure: BillingTenure;
  region: BillingRegion;
  currencyCode: string;
  authNextPath: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startCheckout() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    track("pricing_cta_click", { plan: planId, tenure, region, currency: currencyCode });

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: planId, tenure }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        message?: string;
      } | null;

      if (response.status === 401) {
        const params = new URLSearchParams({ mode: "signup", next: authNextPath });
        window.location.assign(`/get-started?${params.toString()}`);
        return;
      }

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message || "Checkout is not available yet.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout is not available yet.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-base font-bold text-white shadow-sm shadow-brand-600/20 transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-brand-700 active:translate-y-0 active:bg-brand-800 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        <span>{loading ? "Opening checkout" : "Start with JobPosted"}</span>
        {!loading ? <ArrowRight className="size-4" /> : null}
      </button>
      <div aria-live="polite">
        {message ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
