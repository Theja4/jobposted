"use client";

import { useEffect } from "react";
import type { Route } from "next";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { BriefcaseBusiness, Check, FileText } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;
const WELCOME_MS = 1550;
const REDUCED_WELCOME_MS = 450;

const steps = [
  { label: "Account ready", Icon: Check },
  { label: "Workspace synced", Icon: BriefcaseBusiness },
  { label: "Dashboard opening", Icon: FileText },
];

export function AuthWelcomeClient({
  displayName,
  nextPath,
}: {
  displayName: string;
  nextPath: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const name = displayName.trim() || "there";

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        router.replace(nextPath as Route);
        router.refresh();
      },
      reduce ? REDUCED_WELCOME_MS : WELCOME_MS,
    );

    return () => window.clearTimeout(timer);
  }, [nextPath, reduce, router]);

  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden bg-[#f4f9ff] px-5 py-10 text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-2/3 bg-[linear-gradient(180deg,#dbeafe_0%,rgba(239,246,255,0.72)_42%,rgba(255,255,255,0)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-[linear-gradient(0deg,rgba(191,219,254,0.72),rgba(191,219,254,0))]"
      />

      <motion.section
        role="status"
        aria-live="polite"
        initial={reduce ? false : { opacity: 0, y: "28vh", scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.58, ease: EASE }}
        className="flex w-full max-w-3xl flex-col items-center text-center"
      >
        <p className="sr-only">Good to see you, {name}. Opening your workspace.</p>

        <div className="jp-auth-logo-stage relative grid place-items-center">
          <motion.span
            aria-hidden
            initial={reduce ? false : { opacity: 0, scale: 0.72 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.62, delay: 0.08, ease: EASE }}
            className="jp-auth-logo-aura"
          />
          <motion.div
            animate={reduce ? undefined : { y: [0, -7, 0] }}
            transition={{ duration: 2.1, delay: 0.35, repeat: Infinity, ease: "easeInOut" }}
            className="jp-auth-logo-card relative grid size-24 place-items-center rounded-[2rem] bg-white/95 shadow-[0_34px_82px_-28px_rgba(31,100,224,0.68),0_20px_42px_-34px_rgba(7,26,51,0.55)] sm:size-28"
          >
            <Image
              src="/brand/jobposted-mark.png"
              alt=""
              width={160}
              height={151}
              aria-hidden="true"
              priority
              className="h-16 w-[4.5rem] object-contain drop-shadow-[0_16px_22px_rgba(31,100,224,0.18)] sm:h-20 sm:w-[5.5rem]"
            />
          </motion.div>

          {!reduce &&
            steps.map(({ label, Icon }, index) => (
              <motion.span
                key={label}
                aria-hidden
                initial={{ opacity: 0, scale: 0.7, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: [0, index === 1 ? -7 : -5, 0] }}
                transition={{
                  opacity: { duration: 0.28, delay: 0.34 + index * 0.1, ease: EASE },
                  scale: { duration: 0.32, delay: 0.34 + index * 0.1, ease: EASE },
                  y: {
                    duration: 2.2 + index * 0.25,
                    delay: 0.7 + index * 0.16,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
                className={`jp-auth-float-chip jp-auth-float-chip-${index}`}
              >
                <Icon className="size-4" strokeWidth={2.7} />
              </motion.span>
            ))}
        </div>

        <div className="jp-auth-welcome-wordmark-wrap mt-8">
          <div className="jp-auth-welcome-wordmark-glow" aria-hidden />
          <h1 className="jp-auth-welcome-wordmark">
            Job<span>Posted</span>
          </h1>
        </div>
        <p className="mt-4 text-sm font-extrabold text-brand-800 sm:text-base">Opening workspace</p>

        <div className="mt-7 flex items-center justify-center gap-2.5" aria-label="Opening steps">
          {steps.map(({ label, Icon }, index) => (
            <motion.div
              key={label}
              title={label}
              aria-label={label}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.44 + index * 0.12, ease: EASE }}
              className="jp-auth-dock-icon grid size-11 place-items-center rounded-2xl bg-white/82 text-brand-700 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.44)]"
            >
              <Icon className="size-4" strokeWidth={2.8} />
            </motion.div>
          ))}
        </div>

        <div className="jp-auth-progress mt-7 w-full max-w-[23rem] overflow-hidden rounded-full bg-white/88 shadow-[inset_0_1px_3px_rgba(31,100,224,0.1),0_18px_44px_-34px_rgba(31,100,224,0.65)]">
          <motion.div
            aria-hidden
            initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 1.15, delay: 0.22, ease: EASE }}
            className="h-2 origin-left rounded-full bg-[linear-gradient(90deg,#60a5fa,#1f64e0)]"
          />
        </div>
      </motion.section>

      <style>{`
        .jp-auth-logo-stage {
          min-height: 13rem;
          width: min(100%, 28rem);
        }

        .jp-auth-logo-aura {
          position: absolute;
          width: 13rem;
          height: 8rem;
          border-radius: 999px;
          background: radial-gradient(ellipse at center, rgba(47, 125, 244, 0.28), rgba(47, 125, 244, 0));
          filter: blur(28px);
          transform: translateY(1.8rem);
        }

        .jp-auth-logo-card {
          overflow: hidden;
        }

        .jp-auth-logo-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), transparent 42%);
          opacity: 0.8;
          pointer-events: none;
        }

        .jp-auth-float-chip {
          position: absolute;
          display: grid;
          width: 2.65rem;
          height: 2.65rem;
          place-items: center;
          border-radius: 1.05rem;
          color: #1f64e0;
          background: rgba(255, 255, 255, 0.76);
          box-shadow: 0 18px 36px -24px rgba(7, 26, 51, 0.55);
          backdrop-filter: blur(12px) saturate(160%);
          -webkit-backdrop-filter: blur(12px) saturate(160%);
        }

        .jp-auth-float-chip-0 {
          top: 2.6rem;
          left: 4.6rem;
        }

        .jp-auth-float-chip-1 {
          top: 1.8rem;
          right: 4.4rem;
        }

        .jp-auth-float-chip-2 {
          bottom: 1.8rem;
          right: 6rem;
        }

        .jp-auth-welcome-wordmark-wrap {
          position: relative;
          display: inline-flex;
          min-height: 4.6rem;
          align-items: center;
          justify-content: center;
        }

        .jp-auth-welcome-wordmark {
          position: relative;
          z-index: 1;
          margin: 0;
          color: #2f7df4;
          filter: drop-shadow(0 20px 38px rgba(31, 100, 224, 0.13));
          font-size: 3.25rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 0.95;
        }

        .jp-auth-welcome-wordmark span {
          color: #071a33;
        }

        .jp-auth-welcome-wordmark-glow {
          position: absolute;
          inset: auto 10% 0 10%;
          height: 2.4rem;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(96, 165, 250, 0.34), rgba(96, 165, 250, 0));
          filter: blur(20px);
          transform: translateY(0.7rem);
          animation: jp-auth-glow 1.55s ease-in-out infinite;
        }

        @keyframes jp-auth-glow {
          0%,
          100% {
            opacity: 0.5;
            transform: translateY(0.7rem) scale(0.96);
          }
          50% {
            opacity: 0.86;
            transform: translateY(0.58rem) scale(1.03);
          }
        }

        @media (min-width: 640px) {
          .jp-auth-logo-stage {
            min-height: 14rem;
            width: 32rem;
          }

          .jp-auth-welcome-wordmark {
            font-size: 5.25rem;
          }
        }

        @media (max-width: 639px) {
          .jp-auth-float-chip-0 {
            left: 2.8rem;
          }

          .jp-auth-float-chip-1 {
            right: 2.7rem;
          }

          .jp-auth-float-chip-2 {
            right: 4rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .jp-auth-welcome-wordmark-glow {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
