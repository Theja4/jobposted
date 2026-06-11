"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, MousePointer2, ShieldCheck } from "lucide-react";
import { WaitlistForm } from "./WaitlistForm";

/**
 * Scroll-driven hero: a stack of rounded cards peeks below the headline, then the
 * front card rises and expands to fill the viewport while its interior parallaxes.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const still = useMotionValue(1);

  // Headline drifts up and fades as the card rises over it.
  const headY = useTransform(p, [0, 0.32], [0, -90]);
  const headOpacity = useTransform(p, [0.1, 0.3], [1, 0]);
  // Once invisible, stop intercepting clicks/taps meant for the scene below.
  const headPointer = useTransform(headOpacity, (v) => (v < 0.05 ? "none" : "auto"));
  const headVisibility = useTransform(headOpacity, (v) => (v < 0.02 ? "hidden" : "visible"));

  // Card stack: wrapper rises while the front card scales to full bleed.
  const stackY = useTransform(p, [0, 0.55], ["66svh", "0svh"]);
  const stackScale = useTransform(p, [0.02, 0.6], [0.72, 1]);
  const radius = useTransform(p, [0.32, 0.6], ["3rem", "0rem"]);

  // Back cards fan out and dissolve while the front takes over.
  const backOpacity = useTransform(p, [0.14, 0.4], [1, 0]);
  const backAY = useTransform(p, [0, 0.4], ["-2rem", "-7rem"]);
  const backARotate = useTransform(p, [0, 0.4], [-4, -9]);
  const backBY = useTransform(p, [0, 0.4], ["-3.5rem", "-10rem"]);
  const backBRotate = useTransform(p, [0, 0.4], [3.5, 8]);

  if (reduce) {
    return (
      <section className="relative px-3 pt-20 sm:px-5">
        <HeadlineBlock />
        <div className="relative mt-14 h-[86svh] overflow-hidden rounded-[3rem]">
          <HeroScene p={still} />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[300svh]">
      <div className="sticky top-0 h-[100svh] overflow-clip">
        <motion.div
          style={{
            y: headY,
            opacity: headOpacity,
            pointerEvents: headPointer,
            visibility: headVisibility,
          }}
          className="relative z-10"
        >
          <HeadlineBlock />
        </motion.div>

        <motion.div style={{ y: stackY }} className="absolute inset-0">
          <motion.div style={{ scale: stackScale }} className="absolute inset-0 origin-top">
            <motion.div
              aria-hidden
              style={{ x: "-50%", y: backBY, rotate: backBRotate, opacity: backOpacity }}
              className="absolute top-0 left-1/2 h-[60svh] w-[98%] rounded-[3.5rem] bg-[linear-gradient(140deg,#9be4f5_0%,#3ec1d6_100%)]"
            />
            <motion.div
              aria-hidden
              style={{ x: "-50%", y: backAY, rotate: backARotate, opacity: backOpacity }}
              className="absolute top-0 left-1/2 h-[60svh] w-[106%] rounded-[3.5rem] bg-[linear-gradient(140deg,#dceaff_0%,#9fcbff_100%)]"
            />
            <motion.div
              style={{ borderRadius: radius }}
              className="absolute inset-0 overflow-hidden"
            >
              <HeroScene p={p} />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function HeadlineBlock() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pt-24 text-center sm:pt-28">
      <span className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-brand-800">
        <ShieldCheck className="size-3.5 text-brand-600" />
        Copilot, not autopilot — you confirm every send
      </span>

      <h1 className="mt-7 text-5xl leading-[1.02] font-extrabold tracking-[-0.04em] text-balance text-ink sm:text-6xl lg:text-7xl">
        Better job applications, ready for your review.
      </h1>

      <p className="mt-6 max-w-xl text-base leading-7 text-pretty text-muted sm:text-lg">
        JobPosted finds matching roles, tailors your resume to each one, fills the
        application, and waits for you to press send.
      </p>

      <div id="waitlist" className="mt-8 w-full max-w-md scroll-mt-28">
        <WaitlistForm ctaLabel="Join" />
      </div>
      <p className="mt-4 text-sm font-semibold text-muted">
        5 free applications · No card required
      </p>
    </div>
  );
}

/** The illustrated product world inside the takeover card. */
function HeroScene({ p }: { p: MotionValue<number> }) {
  const slow = useTransform(p, [0.45, 1], [0, -60]);
  const mid = useTransform(p, [0.45, 1], [0, -120]);
  const fast = useTransform(p, [0.45, 1], [0, -180]);
  const captionOpacity = useTransform(p, [0.66, 0.82], [0, 1]);
  const captionY = useTransform(p, [0.66, 0.82], [28, 0]);

  return (
    <div className="relative h-full w-full text-white">
      <div className="absolute inset-0 bg-[linear-gradient(155deg,#082555_0%,#11408f_34%,#1f64e0_62%,#4f9cf7_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(50rem_28rem_at_82%_-6%,rgba(125,200,255,0.38),transparent_60%),radial-gradient(40rem_24rem_at_6%_112%,rgba(94,228,255,0.22),transparent_60%)]" />

      {/* slow layer — landscape */}
      <motion.div aria-hidden style={{ y: slow }} className="absolute inset-0">
        <div className="absolute -bottom-[18%] -left-[7%] aspect-square w-[52%] min-w-[22rem] rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(218,240,255,0.92)_0%,rgba(125,186,255,0.55)_38%,rgba(47,125,244,0.1)_66%,transparent_70%)]" />
        <div className="absolute top-[6%] right-[8%] aspect-square w-[34%] rounded-full border border-white/14" />
        <div className="absolute top-[14%] right-[15%] aspect-square w-[19%] rounded-full border border-dashed border-white/22" />
        <div className="absolute top-[12%] left-[9%] h-44 w-64 opacity-45 [background-image:radial-gradient(rgba(255,255,255,0.55)_1.5px,transparent_1.5px)] [background-size:20px_20px]" />
        <svg
          className="absolute bottom-[30%] left-[34%] w-[34%] opacity-35"
          viewBox="0 0 400 120"
          fill="none"
        >
          <path
            d="M4 100C70 20 130 130 200 60s130-40 196-8"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="1 10"
          />
        </svg>
      </motion.div>

      {/* mid layer — matched role */}
      <motion.div
        style={{ y: mid }}
        className="liquid-glass-dark absolute top-[26%] left-[8%] w-[24rem] max-w-[82vw] rotate-[-6deg] rounded-3xl p-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,#ffd98a,#f8b84e)] text-base font-black text-[#3d2c05]">
            S
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold">Senior Product Designer</p>
            <p className="truncate text-sm font-semibold text-white/65">
              Stripe · Remote · Full-time
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-brand-700">
            96% fit
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 w-10/12 rounded-full bg-white/30" />
          <span className="block h-2 w-7/12 rounded-full bg-[#7fe3ec]/70" />
          <span className="block h-2 w-8/12 rounded-full bg-white/20" />
        </div>
      </motion.div>

      {/* fast layer — tailored resume */}
      <motion.div
        style={{ y: fast }}
        className="absolute top-[18%] right-[7%] w-[19rem] max-w-[74vw] rotate-[5deg] rounded-3xl bg-white p-5 text-ink shadow-[0_36px_70px_rgba(4,16,42,0.4)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">Tailored resume</p>
            <p className="text-xs font-semibold text-muted">Rezoomed engine</p>
          </div>
          <span className="grid size-12 place-items-center rounded-full bg-brand-600 text-base font-black text-white">
            97
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 w-full rounded-full bg-brand-100" />
          <span className="block h-2 w-9/12 rounded-full bg-aqua/50" />
          <span className="block h-2 w-10/12 rounded-full bg-brand-200" />
          <span className="block h-2 w-6/12 rounded-full bg-sun/60" />
        </div>
        <div className="mt-4 flex gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-700">
            ATS ready
          </span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">
            Role keywords
          </span>
        </div>
      </motion.div>

      {/* fast layer — the confirm moment */}
      <motion.div style={{ y: fast }} className="absolute right-[10%] bottom-[16%] sm:right-[14%]">
        <span className="absolute -top-7 -right-4 rotate-[8deg] rounded-full bg-sun px-3 py-1 text-[11px] font-black text-[#3d2c05]">
          waiting on you
        </span>
        <div className="liquid-glass-dark flex items-center gap-4 rounded-full py-3 pr-3 pl-6">
          <span className="text-base font-extrabold sm:text-lg">Confirm &amp; send</span>
          <span className="grid size-11 place-items-center rounded-full bg-white text-brand-700">
            <ArrowRight className="size-5" />
          </span>
        </div>
        <MousePointer2 className="absolute -bottom-7 right-10 size-6 rotate-[-12deg] fill-white text-navy drop-shadow-[0_4px_10px_rgba(4,16,42,0.45)]" />
      </motion.div>

      <motion.div
        style={{ opacity: captionOpacity, y: captionY }}
        className="absolute inset-x-0 bottom-8 flex justify-center px-5"
      >
        <p className="liquid-glass-dark rounded-full px-5 py-2.5 text-sm font-bold text-white/90">
          Nothing is submitted until you press confirm.
        </p>
      </motion.div>
    </div>
  );
}
