"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileText, Plus, Search, Send, X } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    number: "01",
    caption: "We surface the roles actually worth applying to",
    label: "Matched roles",
    icon: Search,
    gradient: "from-[#1d7fe8] via-[#1f64e0] to-[#143f91]",
    chip: { text: "96% fit", className: "bg-white text-brand-700" },
    offset: "lg:mt-20",
    detail: {
      title: "Only the roles worth your time",
      body: "JobPosted ranks openings against your profile, preferences, and recent search signal before anything reaches the queue.",
      bullets: ["Fit score before action", "No padded low-quality matches", "ATS roles surfaced first"],
      visual: "match",
    },
  },
  {
    number: "02",
    caption: "Each one gets a resume tailored to the role and the form filled in",
    label: "Resume tailoring",
    icon: FileText,
    gradient: "from-[#27b3d8] via-[#1b86dd] to-[#1f64e0]",
    chip: { text: "ATS ready", className: "bg-sun text-[#3d2c05]" },
    offset: "lg:mt-0",
    detail: {
      title: "A resume shaped for that opening",
      body: "The tailoring step rewrites emphasis, keywords, and proof points around the job, then prepares the application form.",
      bullets: ["Role-specific resume", "ATS-friendly phrasing", "Answers filled from your profile"],
      visual: "resume",
    },
  },
  {
    number: "03",
    caption: "Prepared applications wait for you before anything is submitted",
    label: "Review queue",
    icon: Send,
    gradient: "from-[#143f91] via-[#102f66] to-[#071a33]",
    chip: { text: "you decide", className: "bg-white/90 text-brand-800" },
    offset: "lg:mt-32",
    detail: {
      title: "Daily prep with visible control",
      body: "Supported applications are prepared carefully, logged to your tracker, and held until you review the queue.",
      bullets: ["Daily batch review", "Tracker updated automatically", "Nothing submitted without you"],
      visual: "send",
    },
  },
] as const;

type Step = (typeof STEPS)[number];

export function Steps() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const activeStepData = STEPS.find((step) => step.number === activeStep) ?? null;
  const activeIndex = activeStepData
    ? STEPS.findIndex((step) => step.number === activeStepData.number)
    : -1;

  useEffect(() => {
    if (!activeStep) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveStep(null);
      }
    }

    function handleClickAway(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-step-card]")) return;
      setActiveStep(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickAway);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickAway);
    };
  }, [activeStep]);

  return (
    <section id="how-it-works" className="scroll-mt-24 overflow-x-clip px-5 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-extrabold tracking-[0.2em] text-brand-700 uppercase">
            How it works
          </p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            From match to review-ready, you skip everything in between.
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {STEPS.map((step, index) => {
            const isActive = activeStep === step.number;
            const isAway = activeIndex >= 0 && !isActive;
            const awayDirection = index < activeIndex ? -1 : 1;
            const popupSide = index === 0 ? "right" : index === 2 ? "left" : "center";

            return (
            <Reveal key={step.number} delay={index * 0.08} className={step.offset}>
              <motion.article
                data-step-card={step.number}
                data-active={isActive ? "true" : "false"}
                layout
                animate={
                  reduceMotion
                    ? { opacity: isAway ? 0 : 1 }
                    : {
                        x: isAway ? `${awayDirection * 118}vw` : 0,
                        opacity: isAway ? 0 : 1,
                        scale: isAway ? 0.92 : 1,
                      }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.01 }
                    : { type: "spring", stiffness: 105, damping: 22, mass: 1.08 }
                }
                className={cn(
                  "group relative",
                  isActive && "z-30",
                  isAway && "pointer-events-none",
                )}
              >
                <p className="max-w-[16rem] text-base leading-6 font-semibold text-ink/80">
                  {step.caption}
                </p>
                <div className="relative mt-4">
                  <div
                    onClick={() => {
                      if (!isActive) {
                        setActiveStep(step.number);
                      }
                    }}
                    className={cn(
                      "relative flex min-h-[16rem] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white",
                      "shadow-[0_24px_60px_rgba(16,47,102,0.18)] transition-[transform,box-shadow] duration-500 ease-out",
                      !activeStep &&
                        "cursor-pointer group-hover:-translate-y-2 group-hover:shadow-[0_34px_80px_rgba(16,47,102,0.26)]",
                      isActive && "cursor-default shadow-[0_34px_90px_rgba(16,47,102,0.28)]",
                      step.gradient,
                    )}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)]"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-14 -right-14 size-44 rounded-full bg-white/12 blur-2xl transition duration-500 group-hover:scale-125"
                    />

                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-bold text-white/85">{step.label}</p>
                      <span
                        className={cn(
                          "rotate-[6deg] rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap transition duration-300 group-hover:rotate-0",
                          step.chip.className,
                        )}
                      >
                        {step.chip.text}
                      </span>
                    </div>

                    <span className="liquid-glass-dark mt-5 grid size-12 place-items-center rounded-2xl">
                      <step.icon className="size-5.5" />
                    </span>

                    <div className="mt-auto flex items-end justify-between pt-8">
                      <span className="text-7xl leading-none font-extrabold tracking-[-0.05em] sm:text-8xl">
                        {step.number}
                      </span>
                      <button
                        type="button"
                        aria-label={
                          isActive ? `Close ${step.label} details` : `Learn more about ${step.label}`
                        }
                        aria-controls={`step-popup-${step.number}`}
                        aria-expanded={isActive}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveStep(isActive ? null : step.number);
                        }}
                        className={cn(
                          "grid size-11 place-items-center rounded-full bg-white/16 text-white ring-1 ring-white/25 ring-inset transition duration-300",
                          "hover:scale-105 hover:bg-white hover:text-brand-700 focus-visible:outline-white active:scale-95",
                          isActive && "bg-white text-brand-700",
                        )}
                      >
                        {isActive ? (
                          <X className="size-5 transition-transform duration-300" />
                        ) : (
                          <Plus className="size-5 transition-transform duration-300" />
                        )}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isActive && (
                      <FeatureDetails
                        key={step.number}
                        step={step}
                        side={popupSide}
                        reduceMotion={Boolean(reduceMotion)}
                        onClose={() => setActiveStep(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </motion.article>
            </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureDetails({
  step,
  side,
  reduceMotion,
  onClose,
}: {
  step: Step;
  side: "left" | "center" | "right";
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const desktopPosition =
    side === "right"
      ? "lg:absolute lg:left-[calc(100%+1rem)] lg:top-0"
      : side === "left"
        ? "lg:absolute lg:right-[calc(100%+1rem)] lg:top-0"
        : "lg:absolute lg:left-[calc(50%_-_14rem)] lg:-top-3";
  const initialX = side === "right" ? -30 : side === "left" ? 30 : 0;

  return (
    <motion.div
      id={`step-popup-${step.number}`}
      role="region"
      aria-label={`${step.label} details`}
      initial={reduceMotion ? false : { opacity: 0, x: initialX, scale: 0.96, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: initialX * 0.65, scale: 0.97, filter: "blur(8px)" }}
      transition={
        reduceMotion
          ? { duration: 0.01 }
          : { type: "spring", stiffness: 115, damping: 22, mass: 0.95 }
      }
      className={cn(
        "relative z-40 mt-4 min-h-[16rem] overflow-hidden rounded-[2rem] bg-gradient-to-br p-5 text-white shadow-[0_30px_80px_rgba(16,47,102,0.26)] ring-1 ring-white/28 ring-inset",
        "lg:mt-0 lg:w-[28rem]",
        step.gradient,
        desktopPosition,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/14 blur-2xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-16 size-48 rounded-full bg-white/10 blur-3xl"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${step.label} details`}
        className={cn(
          "absolute right-4 bottom-4 z-20 grid size-11 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-white/25 ring-inset transition duration-300",
          "hover:scale-105 focus-visible:outline-white active:scale-95",
        )}
      >
        <X className="size-5" />
      </button>

      <div className="relative z-10 flex items-start gap-3">
        <FeatureIllustration visual={step.detail.visual} className="h-20 w-24" />
        <div className="min-w-0">
          <h3 className="text-xl leading-tight font-extrabold tracking-[-0.02em] text-balance">
            {step.detail.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-pretty text-white/82">{step.detail.body}</p>
        </div>
      </div>

      <ul className="relative z-10 mt-5 grid gap-2 pr-14">
        {step.detail.bullets.map((bullet) => (
          <li key={bullet} className="flex items-center gap-2 text-sm font-bold text-white/88">
            <span className="size-1.5 rounded-full bg-white" />
            {bullet}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function FeatureIllustration({
  visual,
  className = "h-24 w-28",
}: {
  visual: Step["detail"]["visual"];
  className?: string;
}) {
  const svgClassName = cn(
    "shrink-0 overflow-visible text-white drop-shadow-[0_16px_24px_rgba(3,12,32,0.22)]",
    className,
  );

  if (visual === "resume") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 112 88"
        className={svgClassName}
      >
        <rect x="20" y="8" width="48" height="64" rx="12" fill="currentColor" opacity="0.18" />
        <path d="M36 25h20M36 37h26M36 49h18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path
          d="M73 23l7 7 18-18"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M72 58c10-2 18-7 24-15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="5 6"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>
    );
  }

  if (visual === "send") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 112 88"
        className={svgClassName}
      >
        <path
          d="M18 42l76-26-20 58-18-23-25 15 10-25-23 1z"
          fill="currentColor"
          opacity="0.2"
        />
        <path
          d="M18 42l76-26-38 35m0 0l18 23 20-58M56 51L31 66"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="19" r="5" fill="currentColor" opacity="0.85" />
        <circle cx="92" cy="66" r="4" fill="currentColor" opacity="0.65" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 112 88"
      className={svgClassName}
    >
      <circle cx="52" cy="42" r="28" fill="currentColor" opacity="0.14" />
      <circle cx="52" cy="42" r="18" fill="none" stroke="currentColor" strokeWidth="5" opacity="0.8" />
      <path d="M65 55l20 20" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path
        d="M12 42h14M52 2v14M100 42H86M52 72v14"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.62"
      />
      <path
        d="M41 43l8 8 18-22"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
