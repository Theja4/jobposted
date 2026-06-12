"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { BellRing, Moon, Radar } from "lucide-react";
import { CountUp } from "@/components/ui/CountUp";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Trig results drift in the last ulp between Node and browser engines, which
 *  breaks SSR hydration on generated SVG coords — clamp to a stable precision. */
const fx = (value: number) => Number(value.toFixed(2));

const MISSED_ROLES = [
  { role: "Operations Lead", board: "Greenhouse", fit: "94%", logo: "greenhouse", color: "#00A86B" },
  { role: "Product Analyst", board: "Lever", fit: "91%", logo: "lever", color: "#47A762" },
  { role: "Growth PM", board: "Ashby", fit: "89%", logo: "ashby", color: "#473DD0" },
] as const;

const LOGO_DATA_URIS = {
  lever:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAMAAABg3Am1AAAAMFBMVEVHp6LE/9Sc48R4ybWu78tSr6ay8s1rwLDA/NJguKyAz7hMqqS5989btaqn68iQ2r/YIAuOAAAAXUlEQVRIie3VsQ6AIAxFUUAqIij//7cmstBI2jrz7tyTtCw4t3o59cgKwtHbzMC/AQAAAADo4KSxogJf96GYdMCq109wG1ZiNf1olvhkU5AF0OK3IH14hSYJ88v0AOwqBOY5ZzBqAAAAAElFTkSuQmCC",
  ashby:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAM1BMVEVHPND///9KPtE5K81IO9FFOclHO85JPNRIPdRHcExhWdTn5veppeTJx+4MAMmGgdwnEssw9PVGAAAACnRSTlPt////XyH/usoAai4gUQAABCJJREFUeJztm+u2mzoMhMEGcrjz/k9bwCblorElkYTTtaz2R9duwB/SMJZgJ6vrsng9FEVZ11ldZuaxyMo6K7PqwZiXL8yTAFWRvZ4FyLL/EkACSAAJIAEkgATw7wIY8p+/A7C7mB4AsF2+i8b+GsBU7R6g+zmAHffr561RJlILYIb+AJCPVkegz8Bx/bwdfgtwqsAcRqcCJYCx/RlAKUMtgGnPAK3OjXQA5mgCd2SoBBguCcjzXiVDZQma6/qzGypOpASgKqCUoQrgZMO3ZKgDICuwyPA3ABcbviNDVQYmev08F59JB3C14RsyVAAQNnxDhhqAqw3fkKEcwOAKaGSoAKBs+B3fL8G87a/V/lQN5BlwNjwCIYplqMjAuvRE7ga5fEeSZ6BxYqs+JEMpgHGXPlZQikIRiAHWhdvAzSh0Q3EJXAUs2pKX/xOdUAjgJbhMgnRTspbnmwDuupdh2IKmQChDGYCv/LoEdkSRCIQArhVxScY1kBAIS7BOhK2TGdwVW4kMZQCuAtuNBvuC5lsAu3tgBfiEDGUZaFYX2k6PZTh9B8DbcLed3sAdSSBDEYC74r/7HZoPJG4oAXA132scy5B7ThmAq8AuvXhHYqtAAOBt+PAoBsuQeVIBgHEVPzyMgkMaX4YCALfYMbn3ZSgAcBPh0eXwlMR1Qz6A3whPV3ZbhgKAnqzt+YHlFtwHl2wAs9rwvNeffgljuilDNsDWikznuClDLoC34b67BrICngz5JQDL4ODJkAsA+69AsGTIBDA2NJODYL3G4WbASa2lAwCwZMgD8K1HT19Sg5pTzmscJsDgcno2ARdQHxwZMkvgNsLl4cP1L25OOW7IA3A23IGa4uaU4YYsAD+CQFXDHYkhQw6AnwhxQuGo3sbdkAVAtSKHgF1BXIY8DawnC1zNDRlyAHwFAvXEMoy6IQPA23BI0XhGisqQkwGX3/CsAWsQc8M4gL+6cDVxc4rMQwDg6hvRM7SCmAzjAH4ijKVSK0MGQMcRE56RIg8uowDe5eKurpRhFMAXN7Z8oGcKv9SOAfjUMp76KGUYBZhyXgXwjBSWYQzA2zCjuVLKMArgKsBpL3ENQq9xYgBN/Bq2wDIMuWEYYEsrq8PHzWlIhmGAbZ9nzq/ICkIaDgK8k8p9hIAAAiqAAEu//y7qvBNF74P5AxBg8RFwAhJg+bAdhvEtqnYcBut+DmDnA6YhMMB202DJw2mApmnG/qDpth/H+adkV7J8fD4APijwCPPxPIDQ7wcQ98PatDNnZ8JPZADUDRl8na8CwF3+bQCisyY10OC4fLbaNMCK68EkgMVBAYQ+Hz2c9gED/5Bh6LmdHuZZAD+MBJAAEkACSAAJ4H8A8PjXfotH169ez37122RFVpfaL8h8YH1T1Fldl6+HkpC9irr+A+PhUqjpOZ0SAAAAAElFTkSuQmCC",
} as const;

/**
 * Dark liquid-glass bento for the always-on scout. Every card is a tilting
 * glass slab with a cursor-tracked specular highlight; columns drift at
 * different speeds on scroll; each visual is a designed instrument rather
 * than plain strokes.
 */
export function OpportunityUnlock() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // Columns drift at different speeds while the section crosses the viewport.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const yOuter = useTransform(scrollYProgress, [0, 1], [44, -44]);
  const yCenter = useTransform(scrollYProgress, [0, 1], [76, -76]);
  const yTall = useTransform(scrollYProgress, [0, 1], [22, -22]);
  const columnYs = [yOuter, yCenter, yTall, yOuter, yCenter] as const;

  const cards = [
    {
      title: "Scouting around the clock",
      accent: "rgba(125,180,255,0.5)",
      rest: -1.4,
      visual: <RadarSweep reduce={Boolean(reduce)} />,
      motif: <RingsMotif className="-top-7 -right-7" />,
    },
    {
      title: "Catches roles minutes after they post",
      accent: "rgba(22,199,212,0.45)",
      rest: 1.1,
      visual: <FreshMatch reduce={Boolean(reduce)} />,
      motif: <SquiggleMotif className="top-4 left-5" />,
    },
    {
      title: "Nothing slips past your search",
      accent: "rgba(125,180,255,0.4)",
      rest: 0,
      tall: true,
      visual: <MissedQueue reduce={Boolean(reduce)} />,
      motif: <DotsMotif className="top-5 right-5" />,
    },
    {
      title: "Applies only when the fit is real",
      accent: "rgba(22,199,212,0.5)",
      rest: 1.2,
      visual: <FitGauge reduce={Boolean(reduce)} />,
      motif: <DotsMotif className="-bottom-2 left-5" />,
    },
    {
      title: "Working while you sleep",
      accent: "rgba(38,196,133,0.45)",
      rest: -1.1,
      visual: <OvernightSends reduce={Boolean(reduce)} />,
      motif: <RingsMotif className="-bottom-9 -left-9" />,
    },
  ];

  return (
    <section ref={sectionRef} className="px-3 py-10 sm:px-5 sm:py-14">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-[#070c17] px-5 py-16 text-white shadow-[0_36px_90px_rgba(4,10,28,0.45)] sm:px-10 sm:py-24">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(46rem_28rem_at_50%_-14%,rgba(31,100,224,0.24),transparent_62%),radial-gradient(30rem_20rem_at_6%_112%,rgba(22,199,212,0.1),transparent_60%)]"
        />
        {/* drifting ambient orbs */}
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { x: [0, 60, -30, 0], y: [0, -40, 30, 0] }}
          transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute top-[18%] left-[8%] size-72 rounded-full bg-[radial-gradient(circle,rgba(31,100,224,0.18),transparent_65%)] blur-2xl"
        />
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { x: [0, -70, 40, 0], y: [0, 50, -30, 0] }}
          transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute right-[6%] bottom-[10%] size-80 rounded-full bg-[radial-gradient(circle,rgba(22,199,212,0.12),transparent_65%)] blur-2xl"
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          {/* ── Headline ───────────────────────────────────────── */}
          <div className="mx-auto max-w-3xl text-center">
            <motion.h2
              initial={reduce ? false : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="text-4xl font-extrabold tracking-[-0.035em] text-balance text-white/50 sm:text-6xl"
            >
              Jobs you&apos;d never have found.
            </motion.h2>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 26, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
              className="mt-2 text-4xl font-extrabold tracking-[-0.035em] text-white sm:text-6xl"
            >
              <motion.span
                animate={
                  reduce
                    ? undefined
                    : {
                        textShadow: [
                          "0 0 24px rgba(160,200,255,0.35)",
                          "0 0 52px rgba(160,200,255,0.8)",
                          "0 0 24px rgba(160,200,255,0.35)",
                        ],
                      }
                }
                transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                style={reduce ? { textShadow: "0 0 34px rgba(160,200,255,0.6)" } : undefined}
              >
                Caught for you.
              </motion.span>
            </motion.p>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
              className="mx-auto mt-6 max-w-xl text-base leading-7 text-pretty text-white/60 sm:text-lg"
            >
              Stop refreshing job boards. The scout sweeps fresh listings around the clock and
              applies the moment a strong match appears.
            </motion.p>
          </div>

          {/* ── Bento grid ─────────────────────────────────────── */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, index) => (
              <motion.div
                key={card.title}
                style={reduce ? undefined : { y: columnYs[index] }}
                className={card.tall ? "h-full lg:row-span-2" : "h-full"}
              >
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 56, scale: 0.94, rotate: card.rest * 2.2 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1, rotate: card.rest }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.75, delay: 0.06 * index, ease: EASE }}
                  whileHover={reduce ? undefined : { rotate: 0 }}
                  className="h-full"
                >
                  <GlassCard
                    title={card.title}
                    accent={card.accent}
                    tall={card.tall}
                    motif={card.motif}
                    reduce={Boolean(reduce)}
                  >
                    {card.visual}
                  </GlassCard>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Liquid-glass card with cursor tilt + tracked specular ─────── */

function GlassCard({
  title,
  accent,
  tall,
  motif,
  reduce,
  children,
}: {
  title: string;
  accent: string;
  tall?: boolean;
  motif?: React.ReactNode;
  reduce: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(py, [0, 1], [6.5, -6.5]), { stiffness: 220, damping: 22 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-8, 8]), { stiffness: 220, damping: 22 });
  const mx = useTransform(px, (v) => v * 100);
  const my = useTransform(py, (v) => v * 100);
  const specular = useMotionTemplate`radial-gradient(280px circle at ${mx}% ${my}%, rgba(255,255,255,0.13), transparent 62%)`;

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  }
  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={reduce ? undefined : onMove}
      onMouseLeave={reduce ? undefined : onLeave}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      className={
        "group relative h-full rounded-[1.7rem] p-px transition-shadow duration-500 " +
        "bg-[linear-gradient(165deg,rgba(255,255,255,0.3),rgba(255,255,255,0.07)_28%,rgba(125,180,255,0.14)_62%,rgba(255,255,255,0.05))] " +
        "shadow-[0_26px_60px_-22px_rgba(2,8,24,0.85)] hover:shadow-[0_44px_110px_-30px_rgba(31,100,224,0.55)]"
      }
    >
      <div
        className={
          "relative flex h-full flex-col overflow-hidden rounded-[calc(1.7rem-1px)] bg-[rgba(13,20,38,0.62)] p-6 backdrop-blur-2xl " +
          (tall ? "min-h-[27rem]" : "min-h-[16rem]")
        }
      >
        {/* top specular hairline + sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.07),transparent)]"
        />
        {/* cursor-tracked specular */}
        <motion.span
          aria-hidden
          style={{ background: specular }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        {/* accent under-glow that deepens on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-14 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-90"
          style={{ background: `radial-gradient(ellipse, ${accent}, transparent 70%)` }}
        />
        {/* decorative motif */}
        {motif}

        <h3 className="relative z-10 text-center text-sm font-extrabold tracking-[-0.01em] text-white/85">
          {title}
        </h3>
        <div className="relative z-10 mt-4 flex min-h-0 flex-1 items-center justify-center">
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function CompanyLogo({
  name,
  className = "",
}: {
  name: "vercel" | "greenhouse" | "lever" | "ashby";
  className?: string;
}) {
  if (name === "vercel") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d="m12 1.608 12 20.784H0Z" />
      </svg>
    );
  }

  if (name === "greenhouse") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d="M16.279 7.13c0 1.16-.49 2.185-1.293 2.987-.891.891-2.184 1.114-2.184 1.872 0 1.025 1.65.713 3.231 2.295 1.048 1.047 1.694 2.43 1.694 4.034C17.727 21.482 15.187 24 12 24c-3.187 0-5.727-2.518-5.727-5.68 0-1.607.646-2.989 1.694-4.036 1.582-1.582 3.23-1.27 3.23-2.295 0-.758-1.292-.98-2.183-1.872-.802-.802-1.293-1.827-1.293-3.03 0-2.318 1.895-4.19 4.212-4.19.446 0 .847.067 1.181.067.602 0 .914-.268.914-.691 0-.245-.112-.557-.112-.891 0-.758.647-1.382 1.427-1.382s1.404.646 1.404 1.426c0 .825-.647 1.204-1.137 1.382-.401.134-.713.312-.713.713 0 .758 1.382 1.493 1.382 3.61zm-.446 11.19c0-2.206-1.627-3.99-3.833-3.99-2.206 0-3.833 1.784-3.833 3.99 0 2.184 1.627 3.989 3.833 3.989 2.206 0 3.833-1.808 3.833-3.99zM14.518 7.086c0-1.404-1.136-2.562-2.518-2.562S9.482 5.682 9.482 7.086 10.618 9.65 12 9.65s2.518-1.159 2.518-2.563z" />
      </svg>
    );
  }

  if (name === "lever") {
    return (
      <img
        src={LOGO_DATA_URIS.lever}
        alt=""
        aria-hidden
        className={`rounded-[0.35rem] object-contain ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <img
      src={LOGO_DATA_URIS.ashby}
      alt=""
      aria-hidden
      className={`rounded-[0.35rem] object-contain ${className}`}
      loading="lazy"
    />
  );
}

/* ── Decorative corner motifs (faint, designed, playful) ───────── */

function RingsMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className={`pointer-events-none absolute size-28 text-white/[0.08] transition-transform duration-700 group-hover:rotate-12 ${className ?? ""}`}
    >
      {[14, 26, 38, 50].map((r) => (
        <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="5" />
      ))}
    </svg>
  );
}

function DotsMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 72 72"
      className={`pointer-events-none absolute size-16 text-white/[0.1] transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1 ${className ?? ""}`}
    >
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((col) => (
          <circle key={`${row}-${col}`} cx={8 + col * 18} cy={8 + row * 18} r="2.6" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

function SquiggleMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 96 28"
      className={`pointer-events-none absolute h-6 w-20 text-white/[0.1] transition-transform duration-700 group-hover:translate-x-1.5 ${className ?? ""}`}
    >
      <path
        d="M2 20 Q 12 4, 22 16 T 42 14 T 62 16 T 82 12 T 94 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Card visuals — designed instruments ───────────────────────── */

function RadarSweep({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative size-40 sm:size-44">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <defs>
          <radialGradient id="scoutDish" cx="38%" cy="32%">
            <stop offset="0%" stopColor="#16223f" />
            <stop offset="58%" stopColor="#0c1428" />
            <stop offset="100%" stopColor="#080e1d" />
          </radialGradient>
          <linearGradient id="scoutRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.32)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
          <filter id="scoutGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* dish with depth + specular bias */}
        <circle cx="100" cy="100" r="94" fill="url(#scoutDish)" stroke="url(#scoutRing)" strokeWidth="1.4" />
        <ellipse cx="76" cy="64" rx="52" ry="34" fill="rgba(255,255,255,0.05)" />

        {/* degree ticks */}
        <g stroke="rgba(255,255,255,0.16)" strokeWidth="1.6" strokeLinecap="round">
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * 15 * Math.PI) / 180;
            const r1 = i % 6 === 0 ? 82 : 87;
            return (
              <line
                key={i}
                x1={fx(100 + r1 * Math.cos(a))}
                y1={fx(100 + r1 * Math.sin(a))}
                x2={fx(100 + 92 * Math.cos(a))}
                y2={fx(100 + 92 * Math.sin(a))}
              />
            );
          })}
        </g>

        {/* range rings + crosshair */}
        {[64, 42, 21].map((r, i) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="url(#scoutRing)"
            strokeWidth="1.1"
            opacity={0.85 - i * 0.18}
          />
        ))}
        <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
          <line x1="100" y1="10" x2="100" y2="190" />
          <line x1="10" y1="100" x2="190" y2="100" />
        </g>

        {/* glowing center cap */}
        <circle cx="100" cy="100" r="6" fill="#7db4ff" filter="url(#scoutGlow)" />
      </svg>

      {/* sweep beam with bright leading edge */}
      <motion.span
        aria-hidden
        animate={reduce ? undefined : { rotate: 360 }}
        transition={reduce ? undefined : { duration: 5, repeat: Infinity, ease: "linear" }}
        className="absolute inset-[3%] rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(125,180,255,0.5) 0deg, rgba(125,180,255,0.12) 48deg, transparent 78deg)",
          maskImage: "radial-gradient(circle, black 99%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(circle, black 99%, transparent 100%)",
        }}
      />

      {/* blips: pop + expanding echo ring, timed to the sweep */}
      {[
        { top: "22%", left: "60%", delay: 0.5 },
        { top: "56%", left: "22%", delay: 2.1 },
        { top: "68%", left: "66%", delay: 3.6 },
      ].map((blip) => (
        <span key={`${blip.top}-${blip.left}`} className="absolute" style={{ top: blip.top, left: blip.left }}>
          <motion.span
            animate={reduce ? undefined : { opacity: [0, 1, 1, 0], scale: [0.4, 1.2, 1, 0.6] }}
            transition={
              reduce
                ? undefined
                : { duration: 5, repeat: Infinity, delay: blip.delay, times: [0, 0.1, 0.5, 1] }
            }
            style={reduce ? { opacity: 1 } : undefined}
            className="block size-2.5 rounded-full bg-aqua shadow-[0_0_16px_rgba(22,199,212,1)]"
          />
          {!reduce && (
            <motion.span
              aria-hidden
              animate={{ scale: [0.5, 2.6], opacity: [0.7, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: blip.delay, repeatDelay: 3.4 }}
              className="absolute inset-0 rounded-full border border-aqua/70"
            />
          )}
        </span>
      ))}
    </div>
  );
}

function FreshMatch({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative w-full max-w-[15.5rem]">
      <motion.div
        animate={reduce ? undefined : { y: [18, 0, 0, 0, 18], opacity: [0, 1, 1, 1, 0] }}
        transition={
          reduce
            ? undefined
            : { duration: 5.6, repeat: Infinity, times: [0, 0.12, 0.5, 0.88, 1], ease: "easeOut" }
        }
        className="relative rounded-2xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,0.28),rgba(255,255,255,0.05)_40%,rgba(22,199,212,0.18))]"
      >
        <div className="relative overflow-hidden rounded-[calc(1rem-1px)] bg-[rgba(16,24,44,0.85)] p-4 backdrop-blur-xl">
          {/* sheen sweep across the card */}
          {!reduce && (
            <motion.span
              aria-hidden
              animate={{ x: ["-130%", "130%"] }}
              transition={{ duration: 5.6, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
            />
          )}
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(150deg,#1f64e0,#143f91)] text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
              <CompanyLogo name="vercel" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">Staff Engineer</p>
              <p className="truncate text-xs font-bold text-white/50">Vercel · Remote</p>
            </div>
            <span className="shrink-0 rounded-full bg-mint/90 px-2 py-0.5 text-[10px] font-black text-[#04241a] shadow-[0_0_18px_rgba(38,196,133,0.45)]">
              2m ago
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <span className="block h-1.5 w-10/12 rounded-full bg-white/14" />
            <span className="block h-1.5 w-6/12 rounded-full bg-aqua/40" />
          </div>
        </div>
      </motion.div>

      {/* bell with double ripple */}
      <div className="absolute -top-4 -right-3 grid size-11 place-items-center rounded-full bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] shadow-[0_12px_30px_rgba(31,100,224,0.6),inset_0_1px_0_rgba(255,255,255,0.35)]">
        <motion.span
          animate={reduce ? undefined : { rotate: [0, -14, 12, -8, 6, 0] }}
          transition={reduce ? undefined : { duration: 1.1, repeat: Infinity, repeatDelay: 2.6 }}
        >
          <BellRing className="size-[18px] text-white" />
        </motion.span>
        {!reduce &&
          [0, 0.55].map((delay) => (
            <motion.span
              key={delay}
              aria-hidden
              animate={{ scale: [1, 2.1], opacity: [0.5, 0] }}
              transition={{ duration: 1.7, repeat: Infinity, delay, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border-2 border-[#7db4ff]"
            />
          ))}
      </div>

    </div>
  );
}

function MissedQueue({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative flex w-full flex-col justify-center gap-3 self-stretch">
      {/* scanning beam drifting down the list */}
      {!reduce && (
        <motion.span
          aria-hidden
          animate={{ top: ["-8%", "104%"] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
          className="pointer-events-none absolute inset-x-2 h-10 rounded-full bg-[linear-gradient(180deg,transparent,rgba(125,180,255,0.12),transparent)]"
        />
      )}

      <div className="mx-auto mb-1 grid size-12 place-items-center rounded-2xl bg-[rgba(255,255,255,0.06)] ring-1 ring-white/14 ring-inset shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
        <Radar className="size-5 text-[#7db4ff]" />
      </div>

      {MISSED_ROLES.map((job, index) => (
        <motion.article
          key={job.role}
          initial={reduce ? false : { opacity: 0, x: 30, rotate: 1.5 }}
          whileInView={{ opacity: 1, x: 0, rotate: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 0.18 + index * 0.14, duration: 0.55, ease: EASE }}
          whileHover={reduce ? undefined : { x: 5, transition: { duration: 0.2 } }}
          className="rounded-2xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,0.22),rgba(255,255,255,0.04)_45%,rgba(125,180,255,0.12))]"
        >
          <div className="flex items-center gap-3 rounded-[calc(1rem-1px)] bg-[rgba(16,24,44,0.8)] p-3.5 backdrop-blur-xl">
            <span
              className={
                job.logo === "greenhouse"
                  ? "grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_rgba(0,0,0,0.14)] ring-1 ring-white/55 ring-inset"
                  : "grid size-10 shrink-0 place-items-center rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
              }
              style={{ color: job.color }}
            >
              <CompanyLogo name={job.logo} className={job.logo === "greenhouse" ? "size-5" : "size-10"} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">{job.role}</p>
              <p className="text-xs font-bold text-white/45">{job.board} board</p>
            </div>
            <span className="shrink-0 rounded-full bg-mint px-2.5 py-1 text-[10px] font-black text-[#04241a] shadow-[0_0_18px_rgba(38,196,133,0.35),inset_0_1px_0_rgba(255,255,255,0.45)]">
              {job.fit} fit
            </span>
          </div>
        </motion.article>
      ))}

      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.75, duration: 0.5 }}
        className="mt-1 text-center text-xs font-bold text-white/40"
      >
        Found while you were offline, already in your queue.
      </motion.p>
    </div>
  );
}

function FitGauge({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative grid size-40 place-items-center sm:size-44">
      <svg viewBox="0 0 150 150" className="absolute inset-0 size-full -rotate-90">
        <defs>
          <linearGradient id="fitStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#16c7d4" />
            <stop offset="100%" stopColor="#2f7df4" />
          </linearGradient>
          <filter id="fitGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* fine tick ring */}
        <g stroke="rgba(255,255,255,0.14)" strokeWidth="1.4" strokeLinecap="round">
          {Array.from({ length: 40 }).map((_, i) => {
            const a = (i * 9 * Math.PI) / 180;
            const r1 = i % 5 === 0 ? 66 : 69;
            return (
              <line
                key={i}
                x1={fx(75 + r1 * Math.cos(a))}
                y1={fx(75 + r1 * Math.sin(a))}
                x2={fx(75 + 72 * Math.cos(a))}
                y2={fx(75 + 72 * Math.sin(a))}
              />
            );
          })}
        </g>

        {/* track + glowing progress arc */}
        <circle cx="75" cy="75" r="56" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="10" />
        <motion.circle
          cx="75"
          cy="75"
          r="56"
          fill="none"
          stroke="url(#fitStroke)"
          strokeWidth="10"
          strokeLinecap="round"
          filter="url(#fitGlow)"
          initial={{ pathLength: reduce ? 0.94 : 0 }}
          whileInView={{ pathLength: 0.94 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.6, ease: EASE }}
        />
      </svg>

      {/* glass center disc */}
      <div className="relative grid size-24 place-items-center rounded-full bg-[rgba(255,255,255,0.05)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-6px_14px_rgba(0,0,0,0.3)] ring-1 ring-white/12 ring-inset backdrop-blur-sm">
        <div>
          <p className="text-3xl font-extrabold tracking-[-0.04em] text-white">
            <CountUp to={94} from={40} duration={1.4} />%
          </p>
          <p className="mt-0.5 text-[9px] font-black tracking-[0.16em] text-white/50 uppercase">
            match bar
          </p>
        </div>
      </div>
    </div>
  );
}

function OvernightSends({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative">
        <span className="grid size-16 place-items-center rounded-2xl bg-[rgba(255,255,255,0.06)] ring-1 ring-white/14 ring-inset shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <Moon className="size-7 text-[#a5c8ff]" />
        </span>
        {!reduce &&
          [0, 0.9].map((delay) => (
            <motion.span
              key={delay}
              aria-hidden
              animate={{ scale: [1, 1.65], opacity: [0.4, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay, ease: "easeOut" }}
              className="absolute inset-0 rounded-2xl border border-[#7db4ff]/50"
            />
          ))}
      </div>

      <motion.span
        animate={
          reduce
            ? undefined
            : {
                boxShadow: [
                  "0 0 22px rgba(38,196,133,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
                  "0 0 44px rgba(38,196,133,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
                  "0 0 22px rgba(38,196,133,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
                ],
              }
        }
        transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-black text-[#04241a]"
      >
        <CountUp to={16} duration={1} /> applied overnight ✓
      </motion.span>
      <p className="text-center text-xs font-bold text-white/45">
        Tailored, filled, and sent before your alarm.
      </p>
    </div>
  );
}
