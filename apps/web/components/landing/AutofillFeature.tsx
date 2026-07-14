"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  FileText,
  Gauge,
  MousePointer2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { CHROME_EXTENSION_URL } from "@/lib/site";

const chromeExtensionLinkProps = /^https?:\/\//i.test(CHROME_EXTENSION_URL)
  ? ({ target: "_blank", rel: "noreferrer" } as const)
  : {};

/** The full Autofill marketing page body. Rendered between <Nav /> and <Footer />. */
export function AutofillFeature() {
  return (
    <>
      <AutofillHero />
      <CompatibilityStrip />
      <FeatureGrid />
      <HowItWorks />
      <ClosingCta />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                       */
/* -------------------------------------------------------------------------- */

function AutofillHero() {
  return (
    <section className="relative overflow-hidden px-5 pt-24 pb-16 sm:pt-28 lg:pt-32 lg:pb-20">
      {/* Brand backdrop: faint grid + radial white wash, matching the home hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80svh] bg-[linear-gradient(to_right,rgba(31,100,224,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,100,224,0.055)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(circle_at_50%_30%,black,transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80svh] bg-[radial-gradient(38rem_26rem_at_14%_6%,rgba(30,123,255,0.14),transparent_60%),radial-gradient(34rem_24rem_at_92%_10%,rgba(22,199,212,0.14),transparent_60%)]"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        <div className="max-w-xl">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-chip inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide text-brand-700 uppercase"
          >
            <Sparkles className="size-3.5" />
            Chrome extension
          </motion.span>

          <h1 className="mt-6 text-[2.6rem] leading-[1.04] font-extrabold tracking-[-0.04em] text-balance text-ink sm:text-6xl lg:text-[4.1rem]">
            Every application field,{" "}
            <span className="relative whitespace-nowrap text-brand-600">
              filled in one click
              <Underline />
            </span>
            .
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-8 text-pretty text-muted sm:text-xl">
            JobPosted Autofill reads any job application, maps it to your profile, and completes
            the whole form for you — names, contact details, work history, and the long-tail
            screening questions. You review, then submit.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <AddToChromeButton />
            <p className="flex items-center gap-2 text-sm font-semibold text-muted">
              <ShieldCheck className="size-4 text-brand-600" />
              Free to install · You approve every submit
            </p>
          </div>
        </div>

        <Reveal delay={0.05} className="lg:pl-4">
          <AutofillDemo />
        </Reveal>
      </div>
    </section>
  );
}

/** Hand-drawn brand underline, matching the home hero's pencil emphasis. */
function Underline() {
  const reduce = useReducedMotion();
  return (
    <svg
      aria-hidden
      viewBox="0 0 260 12"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -bottom-[0.22em] left-0 h-[0.34em] w-full overflow-visible text-brand-400"
    >
      <motion.path
        d="M3 8 C60 4, 120 10, 180 6 C214 3.8, 240 8, 257 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Animated autofill demo                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_FIELDS = [
  { label: "Full name", value: "Jordan Rivera" },
  { label: "Email", value: "jordan.rivera@gmail.com" },
  { label: "Phone", value: "+1 (415) 555 0192" },
  { label: "Current company", value: "Stripe" },
  { label: "Work authorization", value: "Authorized to work in the US" },
] as const;

const CYCLE = 5.6; // seconds per loop
const FIRST_FILL = 1.1; // when the first field fills
const STEP = 0.62; // gap between fields

function AutofillDemo() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Floating accent chips */}
      <span className="soft-float absolute -top-4 -right-2 z-20 hidden rounded-full bg-white px-3 py-1.5 text-xs font-black text-brand-700 shadow-[0_12px_26px_rgba(16,47,102,0.16)] sm:block">
        24 fields · 1.2s
      </span>

      <div className="liquid-glass relative overflow-hidden rounded-[2rem] p-6 sm:p-7">
        {/* window chrome */}
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-coral/80" />
          <span className="size-2.5 rounded-full bg-sun/80" />
          <span className="size-2.5 rounded-full bg-mint/80" />
          <span className="ml-3 truncate rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-muted">
            boards.greenhouse.io/apply
          </span>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm font-extrabold text-ink">Application</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-black text-brand-700">
            <Zap className="size-3" />
            Autofilled
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {DEMO_FIELDS.map((field, i) => (
            <DemoField key={field.label} field={field} index={i} reduce={reduce} />
          ))}
        </div>

        {/* The autofill trigger + cursor that "clicks" it each cycle */}
        <div className="relative mt-6">
          <motion.button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="animated-get-started relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-bold text-white"
            animate={
              reduce
                ? undefined
                : { scale: [1, 1, 0.97, 1, 1] }
            }
            transition={
              reduce
                ? undefined
                : {
                    duration: CYCLE,
                    times: [0, 0.08, 0.12, 0.18, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          >
            <span className="animated-get-started__sheen" />
            <Zap className="size-4" />
            Autofill this application
          </motion.button>

          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute right-6 -bottom-2"
              animate={{
                y: [18, 2, 2, 18, 18],
                x: [10, 0, 0, 10, 10],
                opacity: [0, 1, 1, 0, 0],
                scale: [1, 1, 0.86, 1, 1],
              }}
              transition={{
                duration: CYCLE,
                times: [0, 0.06, 0.12, 0.2, 1],
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <MousePointer2 className="size-6 fill-white text-navy drop-shadow-[0_4px_10px_rgba(4,16,42,0.35)]" />
            </motion.span>
          )}
        </div>
      </div>

      {/* Reflected glow beneath the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 left-1/2 h-16 w-4/5 -translate-x-1/2 rounded-[50%] bg-brand-500/25 blur-2xl"
      />
    </div>
  );
}

function DemoField({
  field,
  index,
  reduce,
}: {
  field: { label: string; value: string };
  index: number;
  reduce: boolean | null;
}) {
  const fillAt = (FIRST_FILL + index * STEP) / CYCLE;
  const settle = fillAt + 0.18 / CYCLE;
  const clearAt = 0.94;

  if (reduce) {
    return (
      <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-2.5">
        <p className="text-[10px] font-bold tracking-wide text-muted uppercase">{field.label}</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{field.value}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border border-white/70 bg-white/70 px-3.5 py-2.5"
      animate={{
        borderColor: [
          "rgba(255,255,255,0.7)",
          "rgba(255,255,255,0.7)",
          "rgba(47,125,244,0.55)",
          "rgba(47,125,244,0.55)",
          "rgba(255,255,255,0.7)",
        ],
      }}
      transition={{
        duration: CYCLE,
        times: [0, fillAt, settle, clearAt, 1],
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* highlight sweep as the field fills */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(47,125,244,0.16),transparent)]"
        animate={{ x: ["-110%", "-110%", "110%", "110%", "-110%"] }}
        transition={{
          duration: CYCLE,
          times: [0, fillAt, settle + 0.04, clearAt, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <p className="text-[10px] font-bold tracking-wide text-muted uppercase">{field.label}</p>
      <div className="mt-0.5 flex h-5 items-center">
        <motion.p
          className="text-sm font-semibold text-ink"
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={{
            duration: CYCLE,
            times: [0, fillAt, settle, clearAt, 1],
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {field.value}
        </motion.p>
        {/* empty-state caret before fill */}
        <motion.span
          aria-hidden
          className="h-4 w-px bg-brand-500"
          animate={{ opacity: [0.9, 0.9, 0, 0, 0.9] }}
          transition={{
            duration: CYCLE,
            times: [0, fillAt, settle, clearAt, 1],
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compatibility strip                                                        */
/* -------------------------------------------------------------------------- */

const ATS_NAMES = [
  "Greenhouse",
  "Workday",
  "Lever",
  "Ashby",
  "iCIMS",
  "SmartRecruiters",
  "Taleo",
  "BambooHR",
];

function CompatibilityStrip() {
  return (
    <section className="px-5 pb-6">
      <Reveal className="mx-auto w-full max-w-6xl">
        <div className="glass-chip rounded-3xl px-6 py-6 sm:px-8">
          <p className="text-center text-xs font-bold tracking-[0.14em] text-muted uppercase">
            Works across the top 80 application systems
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {ATS_NAMES.map((name) => (
              <span
                key={name}
                className="text-base font-extrabold tracking-[-0.02em] text-ink/45 transition-colors duration-200 hover:text-ink/75"
              >
                {name}
              </span>
            ))}
            <span className="text-base font-extrabold tracking-[-0.02em] text-brand-600">
              +72 more
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature grid                                                               */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: ScanLine,
    title: "Reads the whole form",
    body: "Autofill detects every input on the page — text fields, dropdowns, radios, and the custom widgets recruiters bolt on — not just the obvious name and email boxes.",
  },
  {
    icon: FileText,
    title: "Maps to your profile",
    body: "Your saved profile and tailored resume fill work history, education, links, and demographics. Screening questions get sensible, editable draft answers.",
  },
  {
    icon: Gauge,
    title: "Minutes back per application",
    body: "A long Workday or Greenhouse form drops from ten minutes of retyping to a single click, so you can apply to the roles that actually fit.",
  },
  {
    icon: BadgeCheck,
    title: "You stay in control",
    body: "Nothing is submitted automatically. Every field is highlighted for a quick review, and you press submit only when it looks right.",
  },
] as const;

function FeatureGrid() {
  return (
    <section id="features" className="px-5 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700">What Autofill does</p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl">
              The tedious part of applying, handled.
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.06}>
              <article className="group h-full rounded-3xl border border-zinc-200/80 bg-white p-7 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_24px_60px_rgba(16,47,102,0.1)]">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                  <feature.icon className="size-6" />
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-[-0.02em] text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2.5 text-base leading-7 text-muted">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  How it works                                                               */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    title: "Add it to Chrome",
    body: "Install from the Chrome Web Store in one click. No setup screens, no credit card.",
  },
  {
    title: "Connect your account",
    body: "Sign in with JobPosted so Autofill knows your profile, resume, and preferences.",
  },
  {
    title: "Autofill any application",
    body: "Open a job form, click Autofill, review the filled fields, and submit when you're ready.",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-5 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700">How it works</p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl">
              Installed in a minute. Useful forever.
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="relative h-full rounded-3xl border border-zinc-200/80 bg-white p-7">
                <span className="text-sm font-black tabular-nums text-brand-600">
                  0{i + 1}
                </span>
                <div
                  aria-hidden
                  className="mt-2 h-px w-full bg-[linear-gradient(90deg,var(--color-brand-200),transparent)]"
                />
                <h3 className="mt-5 text-xl font-bold tracking-[-0.02em] text-ink">{step.title}</h3>
                <p className="mt-2.5 text-base leading-7 text-muted">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Closing CTA                                                                */
/* -------------------------------------------------------------------------- */

function ClosingCta() {
  return (
    <section className="px-3 pt-4 pb-16 sm:px-5">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(150deg,#5b76e8_0%,#3b5fd9_46%,#1f4ec4_100%)] px-6 py-16 text-white shadow-[0_36px_90px_rgba(31,78,196,0.35)] sm:px-12 sm:py-20 lg:px-16">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_22rem_at_18%_-10%,rgba(255,255,255,0.2),transparent_60%),radial-gradient(30rem_20rem_at_100%_110%,rgba(125,227,236,0.18),transparent_60%)]"
          />

          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
              Stop retyping the same form.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-7 text-pretty text-white/80 sm:text-lg">
              Add JobPosted Autofill to Chrome and let every application fill itself. Free to
              install — you always approve the submit.
            </p>
            <div className="mt-9 flex justify-center">
              <AddToChromeButton variant="light" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add to Chrome button + Chrome logo                                         */
/* -------------------------------------------------------------------------- */

function AddToChromeButton({ variant = "brand" }: { variant?: "brand" | "light" }) {
  const light = variant === "light";
  return (
    <a
      href={CHROME_EXTENSION_URL}
      aria-label="Add JobPosted Autofill to Chrome"
      {...chromeExtensionLinkProps}
      className={
        light
          ? "group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-bold text-brand-800 shadow-[0_14px_30px_rgba(7,26,51,0.25)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-sky-50 active:translate-y-0"
          : "group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-brand-600 px-7 text-base font-bold text-white shadow-[0_16px_36px_rgba(31,100,224,0.32)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-brand-700 active:translate-y-0"
      }
    >
      <ChromeLogo className="size-6 transition-transform duration-300 group-hover:rotate-[30deg]" />
      Add to Chrome — it&apos;s free
    </a>
  );
}

/** Multicolor Google Chrome mark, built from geometry so it stays crisp at any size. */
function ChromeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Chrome Web Store">
      {/* red — top */}
      <path d="M24 24 L6.68 14 A20 20 0 0 1 41.32 14 Z" fill="#EA4335" />
      {/* yellow — lower right */}
      <path d="M24 24 L41.32 14 A20 20 0 0 1 24 44 Z" fill="#FBBC04" />
      {/* green — lower left */}
      <path d="M24 24 L24 44 A20 20 0 0 1 6.68 14 Z" fill="#34A853" />
      {/* white ring + blue core */}
      <circle cx="24" cy="24" r="9.6" fill="#ffffff" />
      <circle cx="24" cy="24" r="7.6" fill="#4285F4" />
    </svg>
  );
}
