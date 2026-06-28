"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileText, MousePointer2, MousePointerClick, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/ui/Reveal";

/** One shared loop keeps the cursor, scan, and field checks in sync. */
const LOOP = { duration: 5.2, repeat: Infinity, ease: "easeInOut" as const };

const CHIPS = [
  { icon: MousePointerClick, label: "One-click autofill" },
  { icon: FileText, label: "Tailored resume" },
  { icon: ShieldCheck, label: "You hit submit" },
] as const;

/** Fields cascade in: each fraction is where in the loop that row fills. */
const PANEL_ROWS = [
  { label: "Name", at: 0.22 },
  { label: "Email", at: 0.3 },
  { label: "Phone", at: 0.38 },
  { label: "Work auth", at: 0.46 },
  { label: "Resume", at: 0.54 },
] as const;

export function Extension() {
  const reduce = useReducedMotion();

  return (
    <section id="extension" className="scroll-mt-24 px-3 py-10 sm:px-5 sm:py-14">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-navy px-4 py-16 text-white shadow-[0_36px_90px_rgba(7,26,51,0.35)] sm:px-12 sm:py-20">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(42rem_26rem_at_88%_-14%,rgba(47,125,244,0.32),transparent_60%),radial-gradient(34rem_22rem_at_6%_114%,rgba(22,199,212,0.18),transparent_60%)]"
        />

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="flex items-center gap-2.5">
              <p className="text-sm font-extrabold tracking-[0.2em] text-brand-200 uppercase">
                Chrome extension
              </p>
              <span className="rounded-full bg-[linear-gradient(135deg,#5ee4ff,#1f64e0)] px-2.5 py-0.5 text-[11px] font-black tracking-wide text-white uppercase shadow-[0_8px_20px_rgba(31,100,224,0.45)]">
                New
              </span>
            </div>

            <h2 className="mt-5 text-5xl font-extrabold tracking-[-0.04em] text-balance sm:text-6xl">
              Apply in one click.
            </h2>

            <p className="mt-5 max-w-sm text-lg leading-7 text-white/65">
              It fills the whole application with your tailored resume. You just hit submit.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] py-1.5 pr-3.5 pl-2.5 text-[13px] font-bold text-white/85 ring-1 ring-white/12 ring-inset"
                >
                  <chip.icon className="size-3.5 text-aqua" aria-hidden />
                  {chip.label}
                </span>
              ))}
            </div>

            <Link
              href={{ pathname: "/get-started" }}
              className="group mt-9 inline-flex h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-bold text-navy shadow-[0_18px_40px_rgba(4,16,42,0.45)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(4,16,42,0.55)]"
            >
              <ChromeLogo className="size-6" />
              Add to Chrome
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <BrowserMock reduce={Boolean(reduce)} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Multicolor Google Chrome mark, built from a conic ring + white ring + blue core. */
function ChromeLogo({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} aria-hidden>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from -60deg, #ea4335 0deg 120deg, #fbbc05 120deg 240deg, #34a853 240deg 360deg)",
        }}
      />
      <span className="absolute inset-[20%] rounded-full bg-white" />
      <span className="absolute inset-[31%] rounded-full bg-[#4285f4] ring-[1.5px] ring-white" />
    </span>
  );
}

/** A browser with the JobPosted panel docked, looping through a one-click autofill. */
function BrowserMock({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_70%_30%,rgba(47,125,244,0.45),transparent_70%)] blur-2xl"
      />

      <div className="overflow-hidden rounded-[1.5rem] bg-[#0c2147] shadow-[0_44px_90px_rgba(2,10,28,0.6)] ring-1 ring-white/12">
        {/* title bar */}
        <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-1 flex h-7 flex-1 items-center rounded-full bg-white/[0.06] px-3 text-[11px] font-semibold text-white/45">
            greenhouse.io/stripe
          </div>
        </div>

        <div className="relative flex">
          {/* the form being filled (scan sweeps down it) */}
          <div className="relative hidden flex-1 overflow-hidden p-5 sm:block">
            <p className="text-xs font-extrabold text-white/80">Senior Product Designer</p>
            <div className="mt-4 space-y-3.5">
              {[0.24, 0.34, 0.44, 0.54].map((at, i) => (
                <div key={i}>
                  <span className="block h-1.5 w-16 rounded-full bg-white/20" />
                  <FormField at={at} reduce={reduce} />
                </div>
              ))}
            </div>
            {!reduce ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-x-3 h-9 rounded-lg bg-[linear-gradient(180deg,rgba(94,228,255,0.32),transparent)]"
                animate={{ y: [40, 40, 190, 190, 40], opacity: [0, 0, 1, 0, 0] }}
                transition={{ ...LOOP, times: [0, 0.16, 0.2, 0.6, 0.62] }}
              />
            ) : null}
          </div>

          {/* docked JobPosted panel */}
          <div className="relative w-full shrink-0 border-white/8 bg-[#0a1c3d]/85 p-4 sm:w-[14.5rem] sm:border-l">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-[linear-gradient(150deg,#5ee4ff,#1f64e0)] text-[13px] font-black text-white">
                J
              </span>
              <p className="text-[13px] font-extrabold tracking-tight">JobPosted</p>
              <span className="ml-auto rounded-full bg-mint/20 px-2 py-0.5 text-[9px] font-black tracking-wide text-mint">
                96% fit
              </span>
            </div>

            {/* autofill button + cursor tap */}
            <div className="relative mt-4">
              <motion.div
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#3b82f6,#1f64e0)] text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(31,100,224,0.5)]"
                animate={reduce ? undefined : { scale: [1, 1, 0.95, 1, 1] }}
                transition={reduce ? undefined : { ...LOOP, times: [0, 0.1, 0.15, 0.2, 1] }}
              >
                <MousePointerClick className="size-4" aria-hidden />
                Autofill
              </motion.div>
              {!reduce ? (
                <motion.span
                  aria-hidden
                  className="absolute top-6 left-1/2"
                  animate={{ y: [20, 4, 4, 10, 20], x: [6, -4, -4, -4, 6], opacity: [0, 1, 1, 1, 0] }}
                  transition={{ ...LOOP, times: [0, 0.1, 0.16, 0.24, 0.34] }}
                >
                  <MousePointer2 className="size-5 fill-white text-navy drop-shadow-[0_4px_10px_rgba(4,16,42,0.5)]" />
                </motion.span>
              ) : null}
            </div>

            {/* fields cascade in */}
            <div className="mt-4 space-y-2">
              {PANEL_ROWS.map((row) => (
                <PanelRow key={row.label} label={row.label} at={row.at} reduce={reduce} />
              ))}
            </div>

            {/* done pill */}
            <motion.div
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-mint/15 py-2 text-[11px] font-black text-mint ring-1 ring-mint/25 ring-inset"
              animate={reduce ? undefined : { opacity: [0, 0, 1, 1, 0], y: [6, 6, 0, 0, 6] }}
              transition={reduce ? undefined : { ...LOOP, times: [0, 0.6, 0.66, 0.92, 1] }}
              style={reduce ? { opacity: 1 } : undefined}
            >
              <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
              Ready to submit
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelRow({ label, at, reduce }: { label: string; at: number; reduce: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <motion.span
        className="grid size-4 shrink-0 place-items-center rounded-full bg-mint text-white"
        animate={reduce ? undefined : { scale: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
        transition={reduce ? undefined : { ...LOOP, times: [0, at, Math.min(at + 0.05, 0.9), 0.9, 1] }}
        style={reduce ? undefined : { scale: 0 }}
      >
        <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
      </motion.span>
      <span className="text-[11px] font-semibold text-white/70">{label}</span>
      <motion.span
        className="ml-auto block h-1.5 w-12 rounded-full bg-aqua/55"
        animate={reduce ? undefined : { opacity: [0.15, 0.15, 1, 1, 0.15] }}
        transition={reduce ? undefined : { ...LOOP, times: [0, at, Math.min(at + 0.05, 0.9), 0.9, 1] }}
      />
    </div>
  );
}

function FormField({ at, reduce }: { at: number; reduce: boolean }) {
  return (
    <div className="mt-1.5 flex h-7 items-center gap-2 rounded-md bg-white/[0.05] px-2 ring-1 ring-white/8 ring-inset">
      <motion.span
        className="block h-2 flex-1 rounded-full bg-white/30"
        animate={reduce ? undefined : { opacity: [0.12, 0.12, 1, 1, 0.12] }}
        transition={reduce ? undefined : { ...LOOP, times: [0, at, Math.min(at + 0.05, 0.9), 0.9, 1] }}
      />
      <motion.span
        className="grid size-4 shrink-0 place-items-center rounded-full bg-mint text-white"
        animate={reduce ? undefined : { scale: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
        transition={reduce ? undefined : { ...LOOP, times: [0, at, Math.min(at + 0.05, 0.9), 0.9, 1] }}
        style={reduce ? undefined : { scale: 0 }}
      >
        <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
      </motion.span>
    </div>
  );
}
