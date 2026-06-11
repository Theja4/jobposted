"use client";

import { Check, MousePointerClick, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function ProductLoop() {
  const reduce = useReducedMotion();
  const drift = reduce ? {} : { y: [0, -10, 0], rotate: [0, 0.35, 0] };
  const hover = reduce ? {} : { y: [0, -7, 0] };

  return (
    <div className="relative mx-auto flex min-h-[30rem] w-full max-w-[39rem] items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-4 rounded-2xl bg-brand-50 ring-1 ring-inset ring-brand-100"
      />
      <div
        aria-hidden
        className="absolute right-8 top-8 size-44 rounded-full bg-aqua/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute bottom-10 left-8 size-48 rounded-full bg-brand-300/20 blur-3xl"
      />

      <motion.div
        animate={drift}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10 w-full max-w-[29rem] rounded-2xl bg-white p-5 ring-1 ring-inset ring-brand-100"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-coral" />
            <span className="size-2.5 rounded-full bg-sun" />
            <span className="size-2.5 rounded-full bg-mint" />
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
            Review
          </span>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_auto] gap-5">
          <div>
            <p className="text-sm font-bold text-muted">Queue</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-6xl font-extrabold tracking-[-0.06em] text-ink">12</span>
              <span className="pb-2 text-sm font-extrabold text-brand-700">ready</span>
            </div>
          </div>

          <div className="grid size-20 place-items-center rounded-2xl bg-ink text-white">
            <Sparkles className="size-7 text-aqua" />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_10rem] items-end gap-6">
          <div className="space-y-3">
            <SignalRow width="76%" color="#bfdbfe" />
            <SignalRow width="94%" color="#16c7d4" />
            <SignalRow width="62%" color="#f8b84e" />
          </div>

          <div className="relative flex h-44 items-end gap-3 rounded-2xl bg-panel px-5 pt-6 ring-1 ring-inset ring-brand-100">
            <Column height={62} color="#bfdbfe" />
            <Column height={132} color="#174fb8" active />
            <Column height={88} color="#93c5fd" />
            <Column height={110} color="#dbeafe" />
            <span className="absolute right-5 top-5 rounded-full bg-white px-2.5 py-1 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100">
              96%
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={hover}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
        className="absolute right-0 top-24 z-20 hidden w-44 rotate-3 rounded-2xl bg-white p-4 ring-1 ring-inset ring-brand-100 sm:block"
      >
        <div className="flex items-center justify-between">
          <span className="h-2 w-16 rounded-full bg-brand-600" />
          <span className="grid size-8 place-items-center rounded-xl bg-mint/12 text-mint">
            <Check className="size-4" strokeWidth={2.8} />
          </span>
        </div>
        <div className="mt-5 space-y-2">
          <span className="block h-2 w-full rounded-full bg-brand-100" />
          <span className="block h-2 w-8/12 rounded-full bg-aqua/70" />
          <span className="block h-2 w-10/12 rounded-full bg-sun/70" />
        </div>
      </motion.div>

      <motion.div
        animate={hover}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 0.75 }}
        className="absolute bottom-14 left-2 z-20 w-48 -rotate-2 rounded-2xl bg-ink p-4 text-white"
      >
        <p className="text-xs font-bold text-white/58">Confirm</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-600">
            <MousePointerClick className="size-5" />
          </span>
          <span className="text-2xl font-black tracking-[-0.06em]">Ready</span>
        </div>
      </motion.div>

      <motion.div
        animate={hover}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.1 }}
        className="absolute right-16 bottom-5 z-20 hidden rounded-full bg-brand-600 px-5 py-3 text-sm font-black text-white sm:block"
      >
        Submit later
      </motion.div>
    </div>
  );
}

function SignalRow({ width, color }: { width: string; color: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-brand-50">
      <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
    </div>
  );
}

function Column({
  height,
  color,
  active = false,
}: {
  height: number;
  color: string;
  active?: boolean;
}) {
  return (
    <div
      className="w-9 rounded-t-2xl"
      style={{
        height,
        background: active
          ? "linear-gradient(180deg, #1f64e0 0%, #102f66 100%)"
          : color,
      }}
    />
  );
}
