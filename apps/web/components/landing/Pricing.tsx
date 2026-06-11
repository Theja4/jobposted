"use client";

import { ArrowUpRight, Check, FileCheck2, ShieldCheck, Zap } from "lucide-react";
import { PLANS } from "@jobposted/shared";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { CTAButton } from "@/components/ui/CTAButton";
import { cn } from "@/lib/cn";

type Billing = "monthly" | "annual";

const PRICING_CARDS = [
  {
    name: "Plus",
    eyebrow: "Focused search",
    prices: {
      monthly: `$${PLANS.starter_20.priceUsd}`,
      annual: "$199",
    },
    suffixes: {
      monthly: "per month",
      annual: "per year",
    },
    tagline: "A steady queue for a focused search across open ATS roles.",
    icon: FileCheck2,
    featured: false,
    features: [
      `Up to ${PLANS.starter_20.dailyLimit} applications a day`,
      "Resume tailored to every role",
      "Greenhouse, Lever, and Ashby support",
      "Application tracker and resume vault",
    ],
  },
  {
    name: PLANS.pro_50.name,
    eyebrow: "Most capable",
    prices: {
      monthly: `$${PLANS.pro_50.priceUsd}`,
      annual: "$299",
    },
    suffixes: {
      monthly: "per month",
      annual: "per year",
    },
    tagline: "For wider search coverage with priority routing and browser-session support.",
    icon: Zap,
    featured: true,
    features: [
      `Up to ${PLANS.pro_50.dailyLimit} applications a day`,
      "Priority queue for high-match roles",
      "LinkedIn and Workday via your session",
      "Resume performance analytics",
    ],
  },
] as const;

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <section
      id="pricing"
      className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_42%,#f7fbff_78%,#ffffff_100%)] px-5 py-20 sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(22,199,212,0.2),transparent_26%),radial-gradient(circle_at_82%_22%,rgba(31,100,224,0.18),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(47,125,244,0.16),transparent_34%)]"
      />
      <div
        aria-hidden
        className="soft-float pointer-events-none absolute left-[-6rem] top-24 -z-10 h-64 w-64 rounded-full bg-aqua/20 blur-3xl"
      />
      <div
        aria-hidden
        className="soft-float-slow pointer-events-none absolute right-[-8rem] top-12 -z-10 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-20 -z-10 h-40 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.86),transparent_64%)]"
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-brand-800 ring-1 ring-inset ring-white/80 backdrop-blur-xl">
            <ShieldCheck className="size-4" />
            Pricing that keeps you in control
          </div>
          <h2 className="mt-5 text-4xl font-extrabold tracking-[-0.032em] text-balance text-ink sm:text-6xl">
            Pick the pace. <span className="text-brand-700">Confirm every send.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg">
            Start with real prepared applications, then choose the queue size that matches your
            search. Switch between monthly flexibility and annual value with no hidden submit.
          </p>
          <div className="relative mx-auto mt-7 grid w-fit grid-cols-2 rounded-full bg-white/60 p-1 text-sm font-bold text-ink ring-1 ring-inset ring-white/80 backdrop-blur-xl">
            <motion.span
              aria-hidden
              className="absolute bottom-1 left-1 top-1 rounded-full bg-ink shadow-[0_8px_18px_rgba(7,26,51,0.18)]"
              style={{ width: "calc(50% - 0.25rem)" }}
              initial={false}
              animate={{ x: billing === "annual" ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
            {(["monthly", "annual"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBilling(option)}
                aria-pressed={billing === option}
                className={cn(
                  "relative z-10 min-w-24 rounded-full px-4 py-2 capitalize transition-colors duration-200",
                  billing === option ? "text-white" : "text-muted hover:text-ink",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="relative mt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 -z-10 h-52 w-[88vw] max-w-5xl -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.34),transparent_68%)]"
          />

          <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2 lg:items-stretch">
            {PRICING_CARDS.map((plan, index) => (
              <PlanCard key={plan.name} plan={plan} index={index} billing={billing} />
            ))}
          </div>
        </div>

        <Reveal delay={0.16}>
          <div className="mx-auto mt-10 flex max-w-4xl flex-col gap-3 rounded-2xl bg-white/60 p-4 text-sm text-muted ring-1 ring-inset ring-white/80 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <Check className="size-4" strokeWidth={2.5} />
              </span>
              <p>
                <span className="font-bold text-ink">“Up to” stays honest.</span> Caps depend on
                relevant roles in your pool that day.
              </p>
            </div>
            <a
              href="#faq"
              className="inline-flex items-center gap-1 font-bold text-brand-700 transition hover:text-brand-900"
            >
              Read FAQ <ArrowUpRight className="size-4" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  index,
  billing,
}: {
  plan: (typeof PRICING_CARDS)[number];
  index: number;
  billing: Billing;
}) {
  const Icon = plan.icon;
  const featured = Boolean(plan.featured);
  const cta = `Join ${billing} ${plan.name}`;

  return (
    <Reveal delay={index * 0.07} amount={0.18}>
      <article
        className={cn(
          "group relative flex h-full min-h-[35rem] flex-col overflow-hidden rounded-2xl bg-[#bff0ff]/85 p-5 text-ink ring-1 ring-inset ring-[#7ddcff]/70 backdrop-blur-2xl transition-[transform,background-color,box-shadow] duration-300 ease-out hover:-translate-y-3 hover:bg-[#a8eaff]/90 hover:shadow-[0_28px_70px_rgba(14,165,233,0.2)]",
          featured &&
            "bg-brand-600 text-white ring-brand-200/70 hover:bg-brand-700 hover:shadow-[0_28px_70px_rgba(31,100,224,0.28)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.92),transparent)]",
            featured && "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.72),transparent)]",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl transition duration-500 group-hover:scale-125",
            featured ? "bg-white/30" : "bg-sky-300/55",
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-[-120%] bg-[linear-gradient(105deg,transparent_30%,rgba(255,255,255,0.34)_50%,transparent_70%)] transition-transform duration-700 group-hover:translate-x-[120%]"
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-5 bottom-5 h-20 rounded-[50%] blur-2xl",
            featured ? "bg-white/15" : "bg-sky-300/30",
          )}
        />

        <div className="relative z-10 flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div
              className={cn(
                "grid size-14 place-items-center rounded-2xl bg-white/70 text-brand-700 ring-1 ring-inset ring-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
                featured ? "bg-white/20 text-white ring-white/25" : "bg-white/80 text-sky-700 ring-white/90",
              )}
            >
              <Icon className="size-6" />
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold",
                featured ? "bg-white text-brand-700" : "bg-white/72 text-sky-800 ring-1 ring-inset ring-white/90",
              )}
            >
              {plan.eyebrow}
            </span>
          </div>

          <h3 className={cn("mt-7 text-2xl font-bold", featured ? "text-white" : "text-ink")}>
            {plan.name}
          </h3>
          <p className={cn("mt-2 min-h-14 text-sm leading-6", featured ? "text-white/80" : "text-muted")}>
            {plan.tagline}
          </p>

          <div className="mt-6 flex items-end gap-2">
            <span className="inline-grid min-w-[6rem]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${plan.name}-${billing}-price`}
                  className={cn(
                    "text-5xl font-extrabold tracking-[-0.035em]",
                    featured ? "text-white" : "text-ink",
                  )}
                  initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {plan.prices[billing]}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="inline-grid pb-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${plan.name}-${billing}-suffix`}
                  className={cn("text-sm", featured ? "text-white/70" : "text-muted")}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {plan.suffixes[billing]}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>

          <div className={cn("my-7 h-px", featured ? "bg-white/20" : "bg-white/80")} />

          <p className={cn("text-xs font-extrabold uppercase", featured ? "text-white/70" : "text-sky-800")}>
            Included
          </p>
          <ul className="mt-4 flex-1 space-y-3">
            {plan.features.map((feature) => (
              <li
                key={feature}
                className={cn("flex items-start gap-3 text-sm leading-6", featured ? "text-white/85" : "text-ink/80")}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    featured ? "bg-white text-brand-700" : "bg-white text-sky-700 ring-1 ring-inset ring-sky-200",
                  )}
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <CTAButton
            href="#waitlist"
            variant={featured ? "secondary" : "primary"}
            size="lg"
            className={cn(
              "mt-7 w-full",
              featured && "shadow-[0_14px_30px_rgba(255,255,255,0.16)]",
            )}
            event="pricing_cta_click"
            eventProps={{ plan: plan.name }}
          >
            {cta}
          </CTAButton>
        </div>
      </article>
    </Reveal>
  );
}
