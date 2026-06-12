"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

type RangeKey = "30d" | "3m";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "3m", label: "Last 3 months" },
];

/** On-curve geometry for a 720×260 viewBox. `sent` is the headline series, `resp`
 *  the responses series; `peak` is the highlighted marker + its weekly label. */
const DATA: Record<
  RangeKey,
  {
    sent: string;
    sentArea: string;
    resp: string;
    peak: { x: number; y: number; label: string; value: string };
    total: number;
    responses: number;
  }
> = {
  "30d": {
    sent: "M10 200 C 90 180, 130 120, 200 140 S 320 90 390 120 S 520 40 600 70 S 690 40 710 36",
    sentArea:
      "M10 200 C 90 180, 130 120, 200 140 S 320 90 390 120 S 520 40 600 70 S 690 40 710 36 L710 248 L10 248 Z",
    resp: "M10 224 C 90 214, 150 196, 220 200 S 350 176 420 182 S 560 150 640 138 S 700 128 710 126",
    peak: { x: 390, y: 120, label: "Week 3", value: "34 sent" },
    total: 119,
    responses: 38,
  },
  "3m": {
    sent: "M10 214 C 110 206, 160 150, 240 162 S 360 120 430 130 S 560 60 640 56 S 700 44 710 40",
    sentArea:
      "M10 214 C 110 206, 160 150, 240 162 S 360 120 430 130 S 560 60 640 56 S 700 44 710 40 L710 248 L10 248 Z",
    resp: "M10 230 C 110 224, 170 206, 250 208 S 380 188 450 190 S 590 160 660 150 S 705 142 710 140",
    peak: { x: 430, y: 130, label: "Month 2", value: "146 sent" },
    total: 512,
    responses: 168,
  },
};

export function ApplicationsChart() {
  const reduce = useReducedMotion();
  const [range, setRange] = useState<RangeKey>("30d");
  const d = DATA[range];

  return (
    <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Applications sent</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            Every one reviewed by you before it went out
          </p>
        </div>
        <div className="glass-chip flex gap-1 rounded-full p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors duration-150",
                range === r.key
                  ? "bg-ink text-white shadow-[0_6px_14px_rgba(7,26,51,0.22)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Legend color="#1f64e0" label="Sent" value={d.total} />
        <Legend color="#16c7d4" label="Responses" value={d.responses} />
      </div>

      <div className="relative mt-4">
        <svg viewBox="0 0 720 260" className="h-56 w-full sm:h-64" preserveAspectRatio="none">
          <defs>
            <linearGradient id="appsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f64e0" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#1f64e0" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="appsStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2f7df4" />
              <stop offset="100%" stopColor="#1f50c0" />
            </linearGradient>
          </defs>

          {[40, 100, 160, 220].map((y) => (
            <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="rgba(11,18,32,0.07)" strokeDasharray="2 7" />
          ))}

          <motion.path
            key={`area-${range}`}
            d={d.sentArea}
            fill="url(#appsFill)"
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 1, duration: 0.6 }}
          />
          {/* Responses (secondary) */}
          <motion.path
            key={`resp-${range}`}
            d={d.resp}
            fill="none"
            stroke="#16c7d4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="1 9"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.3, ease: EASE }}
          />
          {/* Sent (primary) */}
          <motion.path
            key={`sent-${range}`}
            d={d.sent}
            fill="none"
            stroke="url(#appsStroke)"
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: EASE }}
          />
          <motion.circle
            key={`peak-${range}`}
            cx={d.peak.x}
            cy={d.peak.y}
            r="6.5"
            fill="#1f64e0"
            stroke="white"
            strokeWidth="3"
            initial={{ scale: reduce ? 1 : 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.9, type: "spring", stiffness: 320, damping: 15 }}
          />
        </svg>

        {/* Floating tooltip pinned to the peak */}
        <motion.div
          key={`tip-${range}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 1.05, duration: 0.3 }}
          style={{ left: `${(d.peak.x / 720) * 100}%`, top: `${(d.peak.y / 260) * 100}%` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[150%] rounded-2xl bg-white px-3 py-1.5 text-center shadow-[0_12px_28px_rgba(7,26,51,0.16)] ring-1 ring-black/5"
        >
          <p className="text-[11px] font-bold text-muted">{d.peak.label}</p>
          <p className="text-sm font-black tracking-tight text-ink">{d.peak.value}</p>
        </motion.div>
      </div>
    </section>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-sm font-bold text-ink">{label}</span>
      <span className="text-sm font-semibold text-muted">· {value}</span>
    </div>
  );
}
