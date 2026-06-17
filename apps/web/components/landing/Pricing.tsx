"use client";

import type {
  BillingPlanId,
  BillingPricingView,
  BillingRegion,
  BillingTenure,
} from "@/lib/billing/plans";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Globe2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { buttonClasses } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type PricingProps = {
  pricing: BillingPricingView;
};

const FEATURE_ROWS = [
  "Up to 20 applications a day",
  "Resume tailoring and profile setup",
  "Review queue and application tracker",
  "Browser extension support",
] as const;

export function Pricing({ pricing }: PricingProps) {
  const [tenure, setTenure] = useState<BillingTenure>("monthly");
  const selected = useMemo(
    () => pricing.options.find((option) => option.tenure === tenure) ?? pricing.options[0]!,
    [pricing.options, tenure],
  );
  const plan = BILLING_PLANS[pricing.planId];

  return (
    <section
      id="pricing"
      className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_42%,#f7fbff_78%,#ffffff_100%)] px-5 py-20 sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(22,199,212,0.18),transparent_26%),radial-gradient(circle_at_82%_22%,rgba(31,100,224,0.16),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(47,125,244,0.14),transparent_34%)]"
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-brand-800 shadow-[0_12px_24px_-18px_rgba(16,47,102,0.38)] backdrop-blur-xl">
            <ShieldCheck className="size-4" />
            One plan. Regional pricing soon.
          </div>
          <h2 className="mt-5 text-4xl font-extrabold text-balance text-ink sm:text-6xl">
            Simple pricing for a serious job search.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg">
            Use the same JobPosted workspace with monthly flexibility or a lower quarterly runway.
            Local currency products are selected automatically when they are configured.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
            <section className="relative overflow-hidden rounded-[1.25rem] bg-brand-600 p-6 text-white shadow-[0_28px_70px_-38px_rgba(31,100,224,0.78)] sm:p-7">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0))]"
              />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-white/18 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                    <Zap className="size-6" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-700">
                    <Globe2 className="size-3.5" />
                    {pricing.localPricingReady ? pricing.currencyCode : "USD"}
                  </span>
                </div>

                <h3 className="mt-7 text-3xl font-extrabold text-white">{plan.label}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/78">
                  Prepared applications, tailored resumes, and a tracker built around review before
                  submit.
                </p>

                <div className="mt-7 grid rounded-2xl bg-white/12 p-1 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] sm:grid-cols-2">
                  {pricing.options.map((option) => (
                    <button
                      key={option.tenure}
                      type="button"
                      onClick={() => setTenure(option.tenure)}
                      aria-pressed={tenure === option.tenure}
                      className={cn(
                        "relative min-h-12 rounded-xl px-4 py-2 transition-colors duration-200",
                        tenure === option.tenure
                          ? "bg-white text-brand-700 shadow-[0_10px_20px_-14px_rgba(7,26,51,0.42)]"
                          : "text-white/78 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      {option.label}
                      {option.highlighted ? (
                        <span className="ml-2 rounded-full bg-mint/18 px-2 py-0.5 text-[11px] text-white">
                          Best value
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex items-end gap-2">
                  <span className="inline-grid min-w-[9rem]">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={`${selected.tenure}-${selected.priceLabel}`}
                        className="text-5xl font-extrabold text-white sm:text-6xl"
                        initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {selected.priceLabel}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className="pb-2 text-sm font-semibold text-white/72">{selected.cadence}</span>
                </div>

                <PlanCheckoutButton
                  planId={pricing.planId}
                  tenure={selected.tenure}
                  region={pricing.region}
                  currencyCode={pricing.currencyCode}
                  className="mt-8"
                >
                  Continue to checkout
                </PlanCheckoutButton>

                {pricing.note ? (
                  <p className="mt-4 rounded-2xl bg-white/12 px-4 py-3 text-xs font-semibold leading-5 text-white/78">
                    {pricing.note}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.25rem] bg-white/82 p-6 shadow-[0_24px_60px_-42px_rgba(16,47,102,0.42)] backdrop-blur-xl sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 shadow-[0_10px_18px_-14px_rgba(31,100,224,0.5)]">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <h3 className="text-xl font-extrabold text-ink">Everything included</h3>
                  <p className="text-sm font-semibold text-muted">
                    Same features across monthly and quarterly billing.
                  </p>
                </div>
              </div>

              <ul className="mt-7 grid gap-3">
                {FEATURE_ROWS.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 rounded-2xl bg-brand-50/72 px-4 py-3 text-sm font-bold text-ink shadow-[0_10px_22px_-18px_rgba(31,100,224,0.26)]"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white text-brand-700">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

            </section>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PlanCheckoutButton({
  planId,
  tenure,
  region,
  currencyCode,
  className,
  children,
}: {
  planId: BillingPlanId;
  tenure: BillingTenure;
  region: BillingRegion;
  currencyCode: string;
  className?: string;
  children: React.ReactNode;
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
        const params = new URLSearchParams({
          mode: "signup",
          next: "/pricing",
        });
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
    <div className={className}>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className={buttonClasses("secondary", "lg", "w-full")}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {loading ? "Opening checkout" : children}
      </button>
      {message ? (
        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-coral shadow-[0_10px_22px_-18px_rgba(15,23,42,0.35)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
