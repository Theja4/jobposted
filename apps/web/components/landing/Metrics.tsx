"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/ui/Reveal";
import { CountUp } from "@/components/ui/CountUp";
import { cn } from "@/lib/cn";

const SCENE_INTERVAL = 5200;

const FIT_PILLS = [
  { label: "Remote first", top: "12%", left: "6%", rotate: -7 },
  { label: "Series B", top: "8%", left: "44%", rotate: 5 },
  { label: "Staff level", top: "26%", left: "26%", rotate: -3 },
  { label: "Design systems", top: "24%", left: "62%", rotate: 8 },
  { label: "Fintech", top: "44%", left: "10%", rotate: 6 },
  { label: "B2B SaaS", top: "46%", left: "44%", rotate: -6 },
  { label: "Hybrid · NYC", top: "62%", left: "24%", rotate: 4 },
  { label: "Growth stage", top: "60%", left: "58%", rotate: -8 },
  { label: "Visa support", top: "78%", left: "12%", rotate: -4 },
  { label: "Meaningful equity", top: "76%", left: "46%", rotate: 7 },
] as const;

const RANGES = ["3 days", "1 week", "1 month", "3 months", "6 months", "1 year"] as const;
type Range = (typeof RANGES)[number];

const RANGE_DATA: Record<Range, { fit: number; ready: number; m1: string; m2: string }> = {
  "3 days": { fit: 92, ready: 6, m1: "+9%", m2: "+18%" },
  "1 week": { fit: 96, ready: 18, m1: "+26%", m2: "+61%" },
  "1 month": { fit: 94, ready: 64, m1: "+31%", m2: "+58%" },
  "3 months": { fit: 95, ready: 170, m1: "+38%", m2: "+72%" },
  "6 months": { fit: 97, ready: 310, m1: "+44%", m2: "+80%" },
  "1 year": { fit: 96, ready: 580, m1: "+52%", m2: "+88%" },
};

export function Metrics() {
  return (
    <section id="analytics" className="scroll-mt-24 px-5 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-extrabold tracking-[0.2em] text-brand-700 uppercase">
            Results
          </p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            Fewer applications. Better outcomes.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-pretty text-muted sm:text-lg">
            The queue optimizes for fit and interviews, not volume. Every number below is
            visible inside your own dashboard.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal delay={0.05} className="h-full">
            <FitSignalsCard />
          </Reveal>
          <Reveal delay={0.12} className="h-full">
            <QueuePerformanceCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Left card: cycles between the fit-signal pill pile and the time-to-ready chart. */
function FitSignalsCard() {
  const reduce = useReducedMotion();
  const [scene, setScene] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setScene((s) => (s + 1) % 2), SCENE_INTERVAL);
    return () => clearInterval(timer);
  }, [reduce]);

  return (
    <article className="liquid-glass flex h-full flex-col rounded-[2rem] p-6 sm:p-7">
      <div className="h-8 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h3
            key={scene}
            initial={reduce ? false : { y: 26, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: -26, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl font-extrabold tracking-[-0.03em] text-ink"
          >
            {scene === 0 ? "Fit signals" : "Time to ready"}
          </motion.h3>
        </AnimatePresence>
      </div>

      <div className="relative mt-5 min-h-[19rem] flex-1 overflow-hidden rounded-3xl bg-white/75 ring-1 ring-white ring-inset">
        <AnimatePresence mode="wait" initial={false}>
          {scene === 0 ? (
            <motion.div
              key="pills"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0"
            >
              {FIT_PILLS.map((pill, index) => (
                <motion.span
                  key={pill.label}
                  initial={reduce ? false : { y: -46, opacity: 0, rotate: pill.rotate - 10 }}
                  animate={{ y: 0, opacity: 1, rotate: pill.rotate }}
                  transition={{
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 260,
                    damping: 18,
                  }}
                  style={{ top: pill.top, left: pill.left }}
                  className="absolute rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-bold whitespace-nowrap text-ink shadow-[0_4px_14px_rgba(16,47,102,0.08)]"
                >
                  {pill.label}
                </motion.span>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="chart"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 p-5"
            >
              <TimeToReadyChart reduce={Boolean(reduce)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex gap-2" aria-hidden>
        {[0, 1].map((index) => (
          <span key={index} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            {scene === index && (
              <motion.span
                key={`fill-${scene}`}
                initial={{ width: reduce ? "100%" : "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: SCENE_INTERVAL / 1000, ease: "linear" }}
                className="block h-full rounded-full bg-brand-600"
              />
            )}
          </span>
        ))}
      </div>
    </article>
  );
}

function TimeToReadyChart({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 420 230" className="h-full w-full" preserveAspectRatio="none">
        {[50, 115, 180].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="420"
            y2={y}
            stroke="rgba(11,18,32,0.1)"
            strokeDasharray="3 6"
          />
        ))}
        <motion.path
          d="M8 170 C 60 90, 100 200, 150 160 S 240 60 290 120 S 380 70 414 56"
          fill="none"
          stroke="#16c7d4"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
        />
        <line
          x1="290"
          y1="120"
          x2="290"
          y2="230"
          stroke="rgba(22,199,212,0.5)"
          strokeDasharray="3 6"
        />
        <motion.circle
          cx="290"
          cy="120"
          r="6"
          fill="#16c7d4"
          stroke="white"
          strokeWidth="2.5"
          initial={{ scale: reduce ? 1 : 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.9, type: "spring", stiffness: 320, damping: 16 }}
        />
      </svg>
      <motion.span
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.05, duration: 0.3 }}
        className="absolute top-[36%] left-[56%] rounded-full bg-ink px-3 py-1 text-xs font-black text-white"
      >
        4 min 12s
      </motion.span>
      <span className="absolute bottom-1 left-1 text-xs font-bold text-muted">
        from match to ready-for-review
      </span>
    </div>
  );
}

/** Right card: range selector, count-up stat tiles, and the drawing line chart. */
function QueuePerformanceCard() {
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("1 week");
  const data = RANGE_DATA[range];

  return (
    <article className="liquid-glass flex h-full flex-col rounded-[2rem] p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-2xl font-extrabold tracking-[-0.03em] text-ink">
          Queue performance
        </h3>
        <div className="glass-chip flex flex-wrap gap-1 rounded-full p-1">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors duration-150",
                range === option
                  ? "bg-ink text-white shadow-[0_6px_14px_rgba(7,26,51,0.22)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid flex-1 gap-4 sm:grid-cols-[11.5rem_1fr]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
          <div className="rounded-3xl bg-[linear-gradient(150deg,#ffd98a,#f8b84e)] p-4 text-[#3d2c05] shadow-[0_16px_36px_rgba(248,184,78,0.35)]">
            <p className="text-[11px] font-black tracking-[0.08em] uppercase">Avg role fit</p>
            <p className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">
              <CountUp key={`fit-${range}`} to={data.fit} from={Math.max(0, data.fit - 30)} />%
            </p>
          </div>
          <div className="rounded-3xl bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] p-4 text-white shadow-[0_16px_36px_rgba(31,100,224,0.35)]">
            <p className="text-[11px] font-black tracking-[0.08em] text-white/80 uppercase">
              Ready to review
            </p>
            <p className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">
              +<CountUp key={`ready-${range}`} to={data.ready} />
            </p>
          </div>
        </div>

        <div className="relative min-h-[15rem] rounded-3xl bg-white/75 p-4 ring-1 ring-white ring-inset">
          <svg viewBox="0 0 460 220" className="h-full w-full" preserveAspectRatio="none">
            {[40, 105, 170].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="460"
                y2={y}
                stroke="rgba(11,18,32,0.1)"
                strokeDasharray="3 6"
              />
            ))}
            <line
              x1="150"
              y1="148"
              x2="150"
              y2="220"
              stroke="rgba(31,100,224,0.35)"
              strokeDasharray="3 6"
            />
            <line
              x1="350"
              y1="58"
              x2="350"
              y2="220"
              stroke="rgba(31,100,224,0.35)"
              strokeDasharray="3 6"
            />
            <motion.path
              key={`path-${range}`}
              d="M6 190 C 60 170, 110 120, 150 148 S 250 168 300 110 S 400 52 454 36"
              fill="none"
              stroke="#1f64e0"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />
            {[
              { cx: 150, cy: 148, delay: 0.55 },
              { cx: 350, cy: 58, delay: 1.05 },
            ].map((marker) => (
              <motion.circle
                key={`${marker.cx}-${range}`}
                cx={marker.cx}
                cy={marker.cy}
                r="6.5"
                fill="#1f64e0"
                stroke="white"
                strokeWidth="2.5"
                initial={{ scale: reduce ? 1 : 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: marker.delay, type: "spring", stiffness: 320, damping: 15 }}
              />
            ))}
          </svg>
          <motion.span
            key={`m1-${range}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.3 }}
            className="absolute top-[52%] left-[22%] rounded-full bg-ink px-2.5 py-1 text-xs font-black text-white"
          >
            {data.m1}
          </motion.span>
          <motion.span
            key={`m2-${range}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.3 }}
            className="absolute top-[14%] left-[64%] rounded-full bg-ink px-2.5 py-1 text-xs font-black text-white"
          >
            {data.m2}
          </motion.span>
          <span className="absolute bottom-2 left-4 text-xs font-bold text-muted">
            interview-ready applications
          </span>
        </div>
      </div>
    </article>
  );
}
