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

const RANGES = ["1 week", "1 month"] as const;
type Range = (typeof RANGES)[number];

/**
 * Applications JobPosted prepared over each window. Volume tracks a real cadence
 * of roughly 15 to 20 review-ready applications a day.
 */
const RANGE_DATA: Record<Range, { sent: number; fit: number; lowDay: number; highDay: number }> = {
  "1 week": { sent: 119, fit: 95, lowDay: 16, highDay: 20 },
  "1 month": { sent: 512, fit: 94, lowDay: 15, highDay: 19 },
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
        from match to sent
      </span>
    </div>
  );
}

/** Per-range shape of the sends-per-day curve. Each entry is the on-curve point
 *  for an SVG path (460×220 viewBox), plus the daily count shown at that point. */
const CURVES: Record<Range, { d: string; area: string; markers: { x: number; y: number; perDay: number }[] }> = {
  "1 week": {
    d: "M8 176 C 70 150, 105 96, 160 120 S 250 70 305 92 S 400 44 452 36",
    area: "M8 176 C 70 150, 105 96, 160 120 S 250 70 305 92 S 400 44 452 36 L452 212 L8 212 Z",
    markers: [
      { x: 160, y: 120, perDay: 16 },
      { x: 305, y: 92, perDay: 18 },
      { x: 452, y: 36, perDay: 20 },
    ],
  },
  "1 month": {
    d: "M8 184 C 80 178, 120 140, 170 150 S 250 120 300 96 S 390 38 452 30",
    area: "M8 184 C 80 178, 120 140, 170 150 S 250 120 300 96 S 390 38 452 30 L452 212 L8 212 Z",
    markers: [
      { x: 170, y: 150, perDay: 15 },
      { x: 300, y: 96, perDay: 17 },
      { x: 452, y: 30, perDay: 19 },
    ],
  },
};

/** Right card: range selector, benefit tiles, and an animated sends-per-day
 *  curve showing the steady 15 to 20/day cadence JobPosted prepares for review. */
function QueuePerformanceCard() {
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("1 week");
  const data = RANGE_DATA[range];
  const curve = CURVES[range];

  return (
    <article className="liquid-glass flex h-full flex-col rounded-[2rem] p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-2xl font-extrabold tracking-[-0.03em] text-ink">
          What JobPosted handled
        </h3>
        <div className="glass-chip flex flex-wrap gap-1 rounded-full p-1">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-bold whitespace-nowrap transition-colors duration-150",
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
            <p className="text-[11px] font-black tracking-[0.08em] uppercase">Prepared this {range}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">
              <CountUp key={`sent-${range}`} to={data.sent} />
            </p>
            <p className="mt-1 text-xs font-bold text-[#3d2c05]/70">
              avg {data.lowDay} to {data.highDay} a day, ready for review
            </p>
          </div>
          <div className="rounded-3xl bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] p-4 text-white shadow-[0_16px_36px_rgba(31,100,224,0.35)]">
            <p className="text-[11px] font-black tracking-[0.08em] text-white/80 uppercase">
              Avg match quality
            </p>
            <p className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">
              <CountUp key={`fit-${range}`} to={data.fit} from={Math.max(0, data.fit - 30)} />%
            </p>
            <p className="mt-1 text-xs font-bold text-white/70">
              only roles worth applying to
            </p>
          </div>
        </div>

        <div className="relative min-h-[15rem] rounded-3xl bg-white/75 p-4 ring-1 ring-white ring-inset">
          <svg viewBox="0 0 460 220" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sendsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1f64e0" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#1f64e0" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="sendsStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#16c7d4" />
                <stop offset="100%" stopColor="#1f64e0" />
              </linearGradient>
            </defs>

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

            <motion.path
              key={`area-${range}`}
              d={curve.area}
              fill="url(#sendsFill)"
              initial={{ opacity: reduce ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.9, duration: 0.6 }}
            />
            <motion.path
              key={`path-${range}`}
              d={curve.d}
              fill="none"
              stroke="url(#sendsStroke)"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />

            {curve.markers.map((marker, index) => (
              <motion.circle
                key={`${marker.x}-${range}`}
                cx={marker.x}
                cy={marker.y}
                r="6.5"
                fill="#1f64e0"
                stroke="white"
                strokeWidth="2.5"
                initial={{ scale: reduce ? 1 : 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: reduce ? 0 : 0.5 + index * 0.35,
                  type: "spring",
                  stiffness: 320,
                  damping: 15,
                }}
              />
            ))}
          </svg>

          {curve.markers.map((marker, index) => (
            <motion.span
              key={`label-${marker.x}-${range}`}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.65 + index * 0.35, duration: 0.3 }}
              style={{
                left: `${(marker.x / 460) * 100}%`,
                top: `${(marker.y / 220) * 100}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-[150%] rounded-full bg-ink px-2.5 py-1 text-xs font-black whitespace-nowrap text-white"
            >
              {marker.perDay}/day
            </motion.span>
          ))}

          <span className="absolute bottom-2 left-4 text-xs font-bold text-muted">
            applications prepared &amp; sent per day
          </span>
        </div>
      </div>
    </article>
  );
}
