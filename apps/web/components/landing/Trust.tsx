"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Ban, CircleCheck, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

const FACTS = [
  { icon: Ban, label: "Never spray and pray, always tailored" },
  { icon: CircleCheck, label: "Powered by Rezoomed" },
] as const;

/** One shared loop so every element of the pipeline stays in sync. */
const LOOP = { duration: 6.5, repeat: Infinity, ease: "easeInOut" as const };

export function Trust() {
  const reduce = useReducedMotion();

  return (
    <section id="trust" className="scroll-mt-24 px-3 py-10 sm:px-5 sm:py-14">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-navy px-4 py-16 text-white shadow-[0_36px_90px_rgba(7,26,51,0.35)] sm:px-12 sm:py-20">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_24rem_at_14%_-12%,rgba(47,125,244,0.3),transparent_60%),radial-gradient(34rem_22rem_at_96%_112%,rgba(22,199,212,0.16),transparent_60%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-extrabold tracking-[0.2em] text-brand-200 uppercase">
              The Process
            </p>
            <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
              It runs on its own.
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <ConfirmPipeline reduce={Boolean(reduce)} />
          </Reveal>

          <Reveal delay={0.12}>
            <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-4">
              {FACTS.map((fact) => (
                <FactChip key={fact.label} icon={fact.icon} label={fact.label} />
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * The story as motion: a matched role leaves discovery, passes through the
 * tailoring pass (its resume is rewritten), and lands in a review queue. You
 * stay in control before anything is submitted.
 */
function ConfirmPipeline({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-6 flex justify-center overflow-x-clip sm:mt-10">
      <div className="origin-top scale-[0.52] min-[480px]:scale-[0.66] sm:scale-[0.84] lg:scale-100">
        <div className="relative h-60 w-[680px]">
          {/* flow line */}
          <div
            aria-hidden
            className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-white/14"
          />

          {/* queue ghosts */}
          <div className="absolute top-1/2 left-1 w-40 -translate-y-1/2 rotate-[-5deg] rounded-2xl bg-white/12 p-3 opacity-50">
            <GhostLines />
          </div>
          <div className="absolute top-1/2 left-5 w-40 -translate-y-1/2 rotate-[2deg] rounded-2xl bg-white/20 p-3 opacity-70">
            <GhostLines />
          </div>

          {/* the travelling application */}
          <motion.div
            animate={
              reduce
                ? undefined
                : {
                    x: [0, 18, 228, 228, 520],
                    opacity: [0, 1, 1, 1, 0],
                  }
            }
            transition={reduce ? undefined : { ...LOOP, times: [0, 0.08, 0.34, 0.6, 0.92] }}
            style={reduce ? { transform: "translateX(228px)" } : undefined}
            className="absolute top-1/2 left-2 z-10 w-44 -translate-y-1/2 rounded-2xl bg-[#102f66] p-3.5 text-white shadow-[0_24px_50px_rgba(2,10,28,0.5)] ring-1 ring-white/12 ring-inset"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold">Product Engineer</p>
              <span className="rounded-full bg-white/14 px-2 py-0.5 text-[9px] font-black text-white ring-1 ring-white/12 ring-inset">
                96%
              </span>
            </div>
            <p className="mt-0.5 text-[10px] font-bold text-white/68">Stripe · Remote</p>
            <div className="mt-2.5 space-y-1.5">
              <span className="block h-1.5 w-10/12 rounded-full bg-white/26" />
              <span className="block h-1.5 w-7/12 rounded-full bg-aqua/55" />
            </div>
            {/* tailored check pops as it passes the tailoring node */}
            <motion.span
              animate={reduce ? undefined : { scale: [0, 0, 0, 1, 1], opacity: [0, 0, 0, 1, 1] }}
              transition={reduce ? undefined : { ...LOOP, times: [0, 0.34, 0.46, 0.54, 1] }}
              className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-mint text-white shadow-[0_8px_18px_rgba(38,196,133,0.5)]"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
                <path
                  d="M3 8.5 6.5 12 13 4.5"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.span>
          </motion.div>

          {/* tailoring badge above the node */}
          <motion.span
            animate={reduce ? undefined : { opacity: [0, 0, 1, 1, 0, 0], y: [6, 6, 0, 0, -4, -4] }}
            transition={reduce ? undefined : { ...LOOP, times: [0, 0.3, 0.38, 0.54, 0.6, 1] }}
            className="absolute top-7 left-[300px] rotate-[5deg] rounded-full bg-sun px-3 py-1 text-[11px] font-black text-[#3d2c05] shadow-[0_10px_24px_rgba(248,184,78,0.4)]"
            style={reduce ? { opacity: 1 } : undefined}
          >
            tailoring your resume
          </motion.span>

          {/* the tailoring node */}
          <motion.div
            animate={reduce ? undefined : { scale: [1, 1, 1.05, 1, 1] }}
            transition={reduce ? undefined : { ...LOOP, times: [0, 0.34, 0.46, 0.56, 1] }}
            className="absolute top-1/2 left-[300px] z-20 flex w-52 -translate-y-1/2 items-center justify-between gap-3 rounded-full bg-white/90 py-3 pr-3 pl-6 text-ink shadow-[0_18px_40px_rgba(2,10,28,0.32)] ring-1 ring-white/70 ring-inset backdrop-blur-xl"
          >
            <span className="text-base font-extrabold whitespace-nowrap">Tailoring</span>
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_8px_18px_rgba(31,100,224,0.24)]">
              <img src="/rezoomed/logo.png" alt="Rezoomed" className="size-full scale-110 object-cover" />
            </span>
          </motion.div>

          {/* sent plane */}
          <motion.div
            animate={
              reduce
                ? undefined
                : { x: [0, 0, 0, 90, 150], y: [10, 10, 10, -34, -60], opacity: [0, 0, 0, 1, 0] }
            }
            transition={reduce ? undefined : { ...LOOP, times: [0, 0.58, 0.66, 0.84, 0.96] }}
            className="absolute top-[88px] left-[540px]"
          >
            <svg width="44" height="36" viewBox="0 0 92 74" fill="none" aria-hidden>
              <path
                d="M6 34 84 6 56 64 40 44z"
                fill="#7db4ff"
                stroke="#dbeafe"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <path d="M40 44 84 6 46 50z" fill="#dbeafe" />
            </svg>
          </motion.div>

          {/* sent chip */}
          <motion.span
            animate={reduce ? undefined : { opacity: [0, 0, 0, 1, 1, 0], scale: [0.8, 0.8, 0.8, 1, 1, 0.9] }}
            transition={reduce ? undefined : { ...LOOP, times: [0, 0.58, 0.72, 0.8, 0.92, 1] }}
            className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full bg-mint/90 px-3.5 py-1.5 text-xs font-black whitespace-nowrap text-white shadow-[0_10px_24px_rgba(38,196,133,0.4)]"
            style={reduce ? { opacity: 1 } : undefined}
          >
            Auto filled ✓
          </motion.span>

          {/* stage labels */}
          <div className="absolute inset-x-2 bottom-0 flex justify-between text-xs font-bold tracking-[0.14em] text-white/45 uppercase">
            <span>Matched</span>
            <span className="-translate-x-3">Tailored</span>
            <span>Auto filled for you</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GhostLines() {
  return (
    <div className="space-y-1.5" aria-hidden>
      <span className="block h-1.5 w-9/12 rounded-full bg-white/40" />
      <span className="block h-1.5 w-6/12 rounded-full bg-white/25" />
      <span className="block h-1.5 w-7/12 rounded-full bg-white/30" />
    </div>
  );
}

function FactChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="liquid-glass-dark inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-bold text-white/90 sm:px-5">
      <Icon className="size-4 text-brand-200" strokeWidth={2.4} />
      {label}
    </span>
  );
}
