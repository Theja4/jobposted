"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Link from "next/link";
import { ArrowRight, LayoutGrid, MousePointer2, Send } from "lucide-react";
import { useAuthUser } from "@/components/auth/useAuthUser";
import { AnimatedGetStartedButton } from "./AnimatedGetStartedButton";

const FLOATING_COMPANY_LOGOS = [
  {
    name: "Microsoft",
    src: "/brand/company-logos/microsoft.svg",
    position: "left-[8%] top-[19%] lg:left-[12%] xl:left-[18%]",
    iconClassName: "size-9",
    rotate: -5,
    drift: 10,
    duration: 7.6,
    delay: 0,
  },
  {
    name: "Google",
    src: "/brand/company-logos/google.svg",
    position: "right-[7%] top-[30%] lg:right-[10%]",
    iconClassName: "size-10",
    rotate: 6,
    drift: 12,
    duration: 8.2,
    delay: 0.18,
  },
  {
    name: "Apple",
    src: "/brand/company-logos/apple.svg",
    position: "left-[7%] top-[62%] lg:left-[9%]",
    iconClassName: "size-9",
    rotate: -3,
    drift: 9,
    duration: 7.2,
    delay: 0.34,
  },
  {
    name: "OpenAI",
    src: "/brand/company-logos/openai.svg",
    position: "right-[25%] top-[48%] lg:right-[28%]",
    iconClassName: "size-9",
    rotate: 4,
    drift: 11,
    duration: 7.8,
    delay: 0.12,
  },
  {
    name: "Anthropic",
    src: "/brand/company-logos/anthropic.svg",
    position: "top-[43%] left-[9%] lg:left-[12%]",
    iconClassName: "size-10",
    rotate: 7,
    drift: 10,
    duration: 8.6,
    delay: 0.48,
  },
  {
    name: "Airbnb",
    src: "/brand/company-logos/airbnb.svg",
    position: "right-[8%] top-[50%] lg:right-[13%]",
    iconClassName: "size-10",
    rotate: -7,
    drift: 13,
    duration: 8,
    delay: 0.62,
  },
] as const;

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

  // The headline block is taller on small screens (the headline wraps to more
  // lines), so the card stack must start lower there or it slides under the
  // waitlist form. Track viewport width and offset the stack accordingly.
  const [stackStart, setStackStart] = useState("66svh");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setStackStart(mq.matches ? "86svh" : "66svh");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Headline drifts up and fades as the card rises over it.
  const headY = useTransform(p, [0, 0.32], [0, -90]);
  const headOpacity = useTransform(p, [0.1, 0.3], [1, 0]);
  // Once invisible, stop intercepting clicks/taps meant for the scene below.
  const headPointer = useTransform(headOpacity, (v) => (v < 0.05 ? "none" : "auto"));
  const headVisibility = useTransform(headOpacity, (v) => (v < 0.02 ? "hidden" : "visible"));

  // Card stack: wrapper rises while the front card scales to full bleed.
  const stackY = useTransform(p, [0, 0.55], [stackStart, "0svh"]);
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
      <section className="relative overflow-hidden px-3 pt-20 sm:px-5">
        <FirstViewportBackdrop reduce={reduce} />
        <div className="relative z-10">
          <HeadlineBlock />
        </div>
        <div className="relative mt-14 h-[86svh] overflow-hidden rounded-[3rem]">
          <HeroScene p={still} />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[300svh]">
      <div className="sticky top-0 h-[100svh] overflow-clip">
        <FirstViewportBackdrop opacity={headOpacity} reduce={reduce} />
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

function FirstViewportBackdrop({
  opacity,
  reduce,
}: {
  opacity?: MotionValue<number>;
  reduce: boolean | null;
}) {
  const staticMotion = Boolean(reduce);

  return (
    <motion.div
      style={opacity ? { opacity } : undefined}
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden sm:block"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[92svh] bg-[linear-gradient(to_right,rgba(31,100,224,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,100,224,0.055)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:linear-gradient(180deg,transparent_0%,black_16%,black_78%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[92svh] bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.86)_35%,rgba(255,255,255,0)_66%)]"
      />

      <p className="sr-only">
        Example company logos shown: Microsoft, Google, Apple, OpenAI, Anthropic, and Airbnb.
      </p>

      {FLOATING_COMPANY_LOGOS.map((logo) => (
        <motion.div
          key={logo.name}
          aria-hidden="true"
          className={`absolute grid size-16 place-items-center rounded-2xl bg-white/95 shadow-[0_10px_24px_rgba(16,47,102,0.13)] backdrop-blur-sm ${logo.position}`}
          initial={staticMotion ? false : { opacity: 0, y: 16, rotate: logo.rotate - 2, scale: 0.92 }}
          animate={
            staticMotion
              ? { opacity: 1, rotate: logo.rotate }
              : {
                  opacity: 1,
                  y: [0, -logo.drift, 0],
                  rotate: [logo.rotate, logo.rotate + 1.1, logo.rotate],
                  scale: 1,
                }
          }
          transition={
            staticMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.45, delay: logo.delay, ease: [0.22, 1, 0.36, 1] },
                  scale: { duration: 0.45, delay: logo.delay, ease: [0.22, 1, 0.36, 1] },
                  y: {
                    duration: logo.duration,
                    delay: logo.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                  rotate: {
                    duration: logo.duration,
                    delay: logo.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }
          }
        >
          <img
            src={logo.src}
            alt=""
            aria-hidden="true"
            className={`${logo.iconClassName} object-contain`}
            decoding="async"
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Shared expo-out ease for the headline choreography. */
const HEADLINE_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function HeadlineBlock() {
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pt-24 text-center sm:pt-28">
      <h1 className="text-[2.5rem] leading-[1.06] font-extrabold tracking-[-0.04em] text-balance text-ink sm:text-6xl lg:text-7xl">
        <MaskedLine reduce={reduce} delay={0}>
          Your job search,
        </MaskedLine>
        <MaskedLine reduce={reduce} delay={0.09}>
          on <AutofilledWord reduce={reduce} word="autopilot" />
        </MaskedLine>
      </h1>

      <motion.p
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.24, ease: HEADLINE_EASE }}
        className="mt-6 max-w-xl text-center text-lg leading-8 text-balance text-muted sm:mt-7 sm:text-xl sm:leading-9"
      >
        From autofill to tracking, JobPosted does the boring work. You just{" "}
        <PencilScribble reduce={reduce}>take the interviews.</PencilScribble>
      </motion.p>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.36, ease: HEADLINE_EASE }}
        className="flex w-full justify-center"
      >
        <HeroCtas />
      </motion.div>
    </div>
  );
}

/** One headline line rising out of a clip mask; padding keeps descenders unclipped. */
function MaskedLine({
  children,
  delay,
  reduce,
}: {
  children: ReactNode;
  delay: number;
  reduce: boolean | null;
}) {
  if (reduce) return <span className="block">{children}</span>;

  // Top padding keeps the sparkles around "autopilot" inside the clip window;
  // bottom padding does the same for descenders. Negative margins cancel both.
  return (
    <span className="-mt-[0.5em] -mb-[0.12em] block overflow-hidden pt-[0.5em] pb-[0.12em]">
      <motion.span
        className="block will-change-transform"
        initial={{ y: "120%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 0.8, delay, ease: HEADLINE_EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Four-point star glint, sized/positioned in em so it scales with the headline. */
const SPARKLES = [
  {
    position: "-top-[0.24em] -right-[0.48em]",
    size: "h-[0.32em] w-[0.32em]",
    color: "#f8b84e",
    delay: 0,
    twinkle: 3.2,
  },
  {
    position: "-top-[0.4em] left-[0.08em]",
    size: "h-[0.18em] w-[0.18em]",
    color: "#fcd28f",
    delay: 0.14,
    twinkle: 2.6,
  },
  {
    position: "top-[0.52em] -right-[0.6em]",
    size: "h-[0.14em] w-[0.14em]",
    color: "#f8b84e",
    delay: 0.26,
    twinkle: 3.8,
  },
] as const;

const SPARKLE_PATH =
  "M12 0C13.1 7.7 16.3 10.9 24 12C16.3 13.1 13.1 16.3 12 24C10.9 16.3 7.7 13.1 0 12C7.7 10.9 10.9 7.7 12 0Z";

/**
 * "autopilot" populates like a form field being autofilled: characters cascade in,
 * then a small constellation of gold glints pops and keeps a slow twinkle.
 */
function AutofilledWord({ word, reduce }: { word: string; reduce: boolean | null }) {
  const start = 0.46;
  const wordDone = start + word.length * 0.026 + 0.12;

  if (reduce) {
    return (
      <span className="relative inline-block whitespace-nowrap text-brand-600">
        {word}
        {SPARKLES.map((sparkle, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute ${sparkle.position} ${sparkle.size}`}
          >
            <svg viewBox="0 0 24 24" className="h-full w-full" fill={sparkle.color}>
              <path d={SPARKLE_PATH} />
            </svg>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="relative inline-block whitespace-nowrap text-brand-600">
      <span className="sr-only">{word}</span>
      <span aria-hidden className="relative">
        {word.split("").map((char, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0, y: "0.28em" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: start + i * 0.026, ease: HEADLINE_EASE }}
          >
            {char}
          </motion.span>
        ))}
      </span>
      {SPARKLES.map((sparkle, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`absolute ${sparkle.position} ${sparkle.size}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: [0, 1.3, 1] }}
          transition={{ duration: 0.5, delay: wordDone + sparkle.delay, ease: HEADLINE_EASE }}
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="h-full w-full"
            fill={sparkle.color}
            animate={{ scale: [1, 0.68, 1], opacity: [1, 0.55, 1], rotate: [0, 14, 0] }}
            transition={{
              duration: sparkle.twinkle,
              delay: wordDone + sparkle.delay + 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <path d={SPARKLE_PATH} />
          </motion.svg>
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Hand-drawn pencil underline: two light graphite passes that draw in after the
 * subhead settles. The emphasis, without touching the font weight.
 */
function PencilScribble({ children, reduce }: { children: ReactNode; reduce: boolean | null }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-[0.24em] left-0 h-[0.34em] w-full overflow-visible text-ink/70"
      >
        <motion.path
          d="M3 7.5 C38 5.4, 74 9.2, 112 7 C142 5.4, 172 8.6, 197 6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.6, ease: HEADLINE_EASE }}
        />
        <motion.path
          d="M6 10 C52 7.8, 108 10.6, 194 8.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: 0.85, ease: HEADLINE_EASE }}
        />
      </svg>
    </span>
  );
}

/** Hero call-to-action — reflects auth state (dashboard link once signed in). */
function HeroCtas() {
  const { user, loading } = useAuthUser();

  if (loading) {
    return <div className="mt-8 h-13 w-64 animate-pulse rounded-full bg-ink/5" aria-hidden />;
  }

  if (user) {
    return (
      <div className="mt-8 flex w-full justify-center">
        <Link
          href={{ pathname: "/dashboard" }}
          className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-brand-600 px-8 text-base font-bold text-white shadow-[0_16px_36px_rgba(31,100,224,0.32)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-brand-700 active:translate-y-0"
        >
          <LayoutGrid className="size-4" />
          Go to dashboard
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex w-full justify-center">
      <AnimatedGetStartedButton href={{ pathname: "/get-started" }} />
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
              Stripe · Remote · Full time
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

      {/* fast layer - the review-ready moment */}
      <motion.div style={{ y: fast }} className="absolute right-[10%] bottom-[16%] sm:right-[14%]">
        <span className="absolute -top-7 -right-4 rotate-[8deg] rounded-full bg-sun px-3 py-1 text-[11px] font-black text-[#3d2c05]">
          review ready
        </span>
        <div className="liquid-glass-dark flex items-center gap-4 rounded-full py-3 pr-3 pl-6">
          <span className="text-base font-extrabold sm:text-lg">Ready to review</span>
          <span className="grid size-11 place-items-center rounded-full bg-white text-brand-700">
            <Send className="size-5" />
          </span>
        </div>
        <MousePointer2 className="absolute -bottom-7 right-10 size-6 rotate-[-12deg] fill-white text-navy drop-shadow-[0_4px_10px_rgba(4,16,42,0.45)]" />
      </motion.div>

      <motion.div
        style={{ opacity: captionOpacity, y: captionY }}
        className="absolute inset-x-0 bottom-8 flex justify-center px-5"
      >
        <p className="liquid-glass-dark rounded-full px-5 py-2.5 text-sm font-bold text-white/90">
          Prepared automatically. You decide what gets submitted.
        </p>
      </motion.div>
    </div>
  );
}
