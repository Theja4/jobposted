"use client";

import { useRef, type CSSProperties } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { CheckCircle2, KanbanSquare, PlugZap } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const COLUMNS = [
  { label: "Applied", count: 18, tone: "bg-brand-500" },
  { label: "Interview", count: 5, tone: "bg-aqua" },
  { label: "Offer", count: 1, tone: "bg-mint" },
] as const;

const PERKS = [
  {
    icon: SendLogIcon,
    label: "Logs every send the moment it happens",
    color: "#1f64e0",
    tint: "#eff6ff",
    glow: "rgba(31,100,224,0.24)",
  },
  {
    icon: StatusPulseIcon,
    label: "Statuses update themselves",
    color: "#1f64e0",
    tint: "#eff6ff",
    glow: "rgba(31,100,224,0.24)",
  },
  {
    icon: ExtensionPlugIcon,
    label: "Works with the extension, apply on any job board, it lands here",
    color: "#1f64e0",
    tint: "#eff6ff",
    glow: "rgba(31,100,224,0.24)",
  },
  {
    icon: QueueBoardIcon,
    label: "Synced with your daily queue",
    color: "#1f64e0",
    tint: "#eff6ff",
    glow: "rgba(31,100,224,0.24)",
  },
] as const;

/** One shared loop so the hero card, the extension drop, and badges stay in step. */
const LOOP = { duration: 9, repeat: Infinity, ease: "easeInOut" as const };

/**
 * "The best job tracker you'll ever use" — because it fills itself. Liquid-glass
 * board with cursor tilt + tracked specular; the hero card drags itself across
 * stages while a second card drops in from the browser extension, so "apply
 * anywhere, it's logged here" needs no paragraph.
 */
export function JobTrackerShowcase() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const copyY = useTransform(scrollYProgress, [0, 1], [28, -28]);
  const boardY = useTransform(scrollYProgress, [0, 1], [64, -64]);

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden px-5 py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_14%_20%,rgba(31,100,224,0.1),transparent_30%),radial-gradient(circle_at_88%_70%,rgba(22,199,212,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5faff_55%,#ffffff_100%)]"
      />
      {/* drifting ambient orb */}
      <motion.span
        aria-hidden
        animate={reduce ? undefined : { x: [0, 50, -30, 0], y: [0, -36, 24, 0] }}
        transition={reduce ? undefined : { duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-[16%] right-[10%] -z-10 size-72 rounded-full bg-[radial-gradient(circle,rgba(31,100,224,0.12),transparent_65%)] blur-2xl"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        {/* ── Copy ───────────────────────────────────────────── */}
        <motion.div style={reduce ? undefined : { y: copyY }}>
          <div className="max-w-xl">
            <motion.span
              initial={reduce ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-extrabold text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(31,100,224,0.1)] ring-1 ring-inset ring-brand-100"
            >
              <KanbanSquare className="size-4" />
              Job tracker
            </motion.span>

            <motion.h2
              initial={reduce ? false : { opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.65, delay: 0.08, ease: EASE }}
              className="mt-5 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl"
            >
              The best job tracker you&apos;ll{" "}
              <motion.span
                className="text-brand-700"
                animate={
                  reduce
                    ? undefined
                    : {
                        textShadow: [
                          "0 0 18px rgba(31,100,224,0.0)",
                          "0 0 30px rgba(31,100,224,0.45)",
                          "0 0 18px rgba(31,100,224,0.0)",
                        ],
                      }
                }
                transition={reduce ? undefined : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
              >
                ever use.
              </motion.span>
            </motion.h2>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
              className="mt-5 max-w-lg text-base leading-7 text-pretty text-muted sm:text-lg"
            >
              Because you never have to fill it in. Every application lands on the board the
              moment it&apos;s sent, by JobPosted or by you, anywhere on the web.
            </motion.p>

            <div className="mt-7 space-y-3">
              {PERKS.map((perk, index) => (
                <PerkRow key={perk.label} perk={perk} index={index} reduce={Boolean(reduce)} />
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Self-filling glass board ───────────────────────── */}
        <motion.div style={reduce ? undefined : { y: boardY }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 60, scale: 0.95, rotate: 1.6 }}
            whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          >
            <TrackerBoard reduce={Boolean(reduce)} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function SendLogIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <path
        d="M5.8 7.4h6.6c2.7 0 4.9 2.2 4.9 4.9s-2.2 4.9-4.9 4.9h-1.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M8.1 4.9 5.3 7.4l2.8 2.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.4 13.2h5.1"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.48"
      />
      <circle cx="17.6" cy="16.4" r="2.6" fill="currentColor" opacity="0.22" />
      <path
        d="m16.5 16.4.7.7 1.5-1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusPulseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <rect
        x="4.6"
        y="5"
        width="14.8"
        height="14"
        rx="3.4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7.6 13h2.4l1.3-3.5 2.1 6 1.4-2.5h1.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.6" cy="8.8" r="1.1" fill="currentColor" opacity="0.35" />
      <circle cx="15.5" cy="8.8" r="1.1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function ExtensionPlugIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <path
        d="M8.4 4.5v4M14.6 4.5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 8.3h10v3.5a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 16.8v2.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m14.5 12-2.4 2.8h2.2l-1.9 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.8 9.8h7.4v2H7.8z" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function QueueBoardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <rect
        x="4"
        y="4.8"
        width="16"
        height="14.4"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.3 8.2v7.6M14.7 8.2v7.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.58"
      />
      <rect x="6.7" y="8.1" width="2.4" height="3.7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="10.8" y="11.8" width="2.4" height="4" rx="1" fill="currentColor" opacity="0.28" />
      <rect x="15" y="8.1" width="2.4" height="5.4" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/* ── Perk rows: light glass, staggered, hover nudge ────────────── */

function PerkRow({
  perk,
  index,
  reduce,
}: {
  perk: (typeof PERKS)[number];
  index: number;
  reduce: boolean;
}) {
  const Icon = perk.icon;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -22 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ delay: 0.12 + index * 0.09, duration: 0.5, ease: EASE }}
      whileHover={reduce ? undefined : { x: 5, transition: { duration: 0.2 } }}
      style={
        {
          "--perk-color": perk.color,
          "--perk-tint": perk.tint,
          "--perk-glow": perk.glow,
        } as CSSProperties
      }
      className="group/perk rounded-2xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(255,255,255,0.4)_45%,rgba(31,100,224,0.14))] shadow-[0_10px_28px_-14px_rgba(16,47,102,0.25)] transition-[background,box-shadow,transform] duration-300 hover:bg-[var(--perk-color)] hover:shadow-[0_20px_44px_-18px_var(--perk-glow)]"
    >
      <div className="relative flex items-center gap-3 overflow-hidden rounded-[calc(1rem-1px)] bg-white/75 p-3.5 backdrop-blur-xl transition-colors duration-300 group-hover/perk:bg-[var(--perk-tint)]">
        <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(150deg,#eff6ff,#dbeafe)] text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-inset ring-brand-100 transition-[background,color,box-shadow,transform] duration-300 group-hover/perk:scale-110 group-hover/perk:bg-[var(--perk-color)] group-hover/perk:text-ink group-hover/perk:shadow-[0_10px_24px_-10px_var(--perk-glow)] group-hover/perk:ring-white/70">
          <span
            aria-hidden
            className="absolute -right-3 -top-3 size-6 rounded-full bg-white/35 opacity-0 transition duration-300 group-hover/perk:opacity-100"
          />
          <Icon className="relative z-10 size-4.5 transition-transform duration-300 group-hover/perk:rotate-[-6deg] group-hover/perk:scale-110" />
        </span>
        <p className="text-sm font-extrabold text-ink transition-colors duration-300 group-hover/perk:text-[var(--perk-color)]">
          {perk.label}
        </p>
      </div>
    </motion.div>
  );
}

/* ── The board: liquid-glass slab with cursor tilt ─────────────── */

function TrackerBoard({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [4.5, -4.5]), { stiffness: 200, damping: 24 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-5.5, 5.5]), { stiffness: 200, damping: 24 });
  const mx = useTransform(px, (v) => v * 100);
  const my = useTransform(py, (v) => v * 100);
  const specular = useMotionTemplate`radial-gradient(320px circle at ${mx}% ${my}%, rgba(255,255,255,0.55), transparent 60%)`;

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

  // The hero card is 26% of the board wide; one column step (column + gap) is
  // ~34% of the board, so each hop translates by 34/26 of the card's own width.
  const hop = "130%";
  const hop2 = "260%";

  return (
    <motion.div
      ref={ref}
      onMouseMove={reduce ? undefined : onMove}
      onMouseLeave={reduce ? undefined : onLeave}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1100 }}
      className="group relative mx-auto w-full max-w-2xl rounded-[1.85rem] p-px bg-[linear-gradient(165deg,rgba(255,255,255,1),rgba(255,255,255,0.45)_30%,rgba(31,100,224,0.18)_70%,rgba(255,255,255,0.5))] shadow-[0_30px_70px_-24px_rgba(16,47,102,0.4)] transition-shadow duration-500 hover:shadow-[0_48px_110px_-30px_rgba(31,100,224,0.5)]"
    >
      <div className="relative overflow-hidden rounded-[calc(1.85rem-1px)] bg-white/70 p-5 backdrop-blur-2xl sm:p-6">
        {/* specular hairline + cursor-tracked sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)]"
        />
        <motion.span
          aria-hidden
          style={{ background: specular }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        {/* accent under-glow */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/2 h-36 w-3/4 -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(31,100,224,0.22),transparent_70%)] opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        />
        {/* corner motif */}
        <svg
          aria-hidden
          viewBox="0 0 72 72"
          className="pointer-events-none absolute top-4 right-4 size-12 text-brand-700/[0.08] transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
        >
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2].map((col) => (
              <circle key={`${row}-${col}`} cx={10 + col * 24} cy={10 + row * 24} r="3" fill="currentColor" />
            )),
          )}
        </svg>

        {/* board header */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-ink">Your pipeline</p>
        </div>

        {/* columns */}
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-3">
          {COLUMNS.map((column, columnIndex) => (
            <div
              key={column.label}
              className="rounded-2xl bg-white/65 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-8px_18px_rgba(16,47,102,0.04)] ring-1 ring-inset ring-brand-100/60"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[11px] font-black tracking-wide text-ink/70 uppercase">
                  {column.label}
                </p>
                <span className={`grid size-5 place-items-center rounded-full text-[10px] font-black text-white ${column.tone}`}>
                  {column.count}
                </span>
              </div>

              {/* travel lane the hero card moves through */}
              <div className="h-[4.5rem]" aria-hidden />

              {/* slots: the Applied column receives the extension drop */}
              <div className="space-y-2">
                {columnIndex === 0 ? <ExtensionDrop reduce={reduce} /> : <GhostCard />}
                <GhostCard faint />
              </div>
            </div>
          ))}
        </div>

        {/* the self-moving hero card */}
        <motion.div
          animate={
            reduce
              ? undefined
              : {
                  x: ["0%", "0%", hop, hop, hop2, hop2, hop2],
                  y: [0, 0, -8, 0, -8, 0, 0],
                  rotate: [0, 0, 2.5, 0, 2.5, 0, 0],
                  opacity: [0, 1, 1, 1, 1, 1, 0],
                  scale: [0.92, 1, 1, 1, 1, 1, 0.95],
                }
          }
          transition={reduce ? undefined : { ...LOOP, times: [0, 0.06, 0.3, 0.5, 0.74, 0.95, 1] }}
          style={reduce ? { transform: "translateX(130%)" } : undefined}
          className="absolute top-[6.7rem] left-[1.95rem] z-20 w-[26%] rounded-xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,1),rgba(255,255,255,0.5)_45%,rgba(31,100,224,0.22))] shadow-[0_16px_38px_rgba(16,47,102,0.22)] sm:top-[7rem] sm:left-[2.2rem]"
        >
          <div className="rounded-[calc(0.75rem-1px)] bg-white/95 p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[linear-gradient(150deg,#1f64e0,#143f91)] text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                S
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-extrabold text-ink">Product Designer</p>
                <p className="truncate text-[9px] font-bold text-muted">Stripe · 96%</p>
              </div>
            </div>
            {/* offer badge pops on the final column */}
            <motion.span
              animate={reduce ? undefined : { scale: [0, 0, 0, 0, 0, 1, 1], opacity: [0, 0, 0, 0, 0, 1, 1] }}
              transition={reduce ? undefined : { ...LOOP, times: [0, 0.3, 0.5, 0.7, 0.78, 0.84, 1] }}
              className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-mint text-white shadow-[0_8px_18px_rgba(38,196,133,0.5)]"
              style={reduce ? { opacity: 0 } : undefined}
            >
              <CheckCircle2 className="size-3.5" />
            </motion.span>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}

/* ── A card dropping in from the browser extension ─────────────── */

function ExtensionDrop({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative">
      <motion.div
        animate={
          reduce
            ? undefined
            : {
                opacity: [0, 0, 1, 1, 1, 0],
                y: [-26, -26, 0, 0, 0, 6],
                scale: [0.9, 0.9, 1, 1, 1, 0.96],
              }
        }
        transition={reduce ? undefined : { ...LOOP, times: [0, 0.34, 0.44, 0.8, 0.95, 1], ease: EASE }}
        className="relative rounded-xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,1),rgba(255,255,255,0.5)_45%,rgba(22,199,212,0.25))] shadow-[0_12px_28px_rgba(16,47,102,0.16)]"
      >
        <div className="rounded-[calc(0.75rem-1px)] bg-white/95 p-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[linear-gradient(150deg,#0a66c2,#084c8f)] text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
              in
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-ink">UX Researcher</p>
              <p className="truncate text-[9px] font-bold text-muted">LinkedIn · you applied</p>
            </div>
          </div>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-aqua/12 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-[#0a6b73] uppercase ring-1 ring-inset ring-aqua/25">
            <PlugZap className="size-2.5" />
            via extension
          </span>
        </div>

        {/* landing pulse */}
        {!reduce && (
          <motion.span
            aria-hidden
            animate={{ scale: [0.9, 0.9, 1.12, 1], opacity: [0, 0, 0.7, 0] }}
            transition={{ ...LOOP, times: [0, 0.43, 0.5, 0.62] }}
            className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-aqua/60"
          />
        )}
      </motion.div>

      {/* ghost placeholder so the column doesn't collapse while the card is away */}
      <div className="absolute inset-0 -z-10">
        <GhostCard faint />
      </div>
    </div>
  );
}

function GhostCard({ faint }: { faint?: boolean }) {
  return (
    <div className={`rounded-xl bg-brand-50/70 p-2.5 ${faint ? "opacity-45" : "opacity-75"}`}>
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-lg bg-brand-100" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className="block h-1.5 w-9/12 rounded-full bg-brand-200/80" />
          <span className="block h-1.5 w-6/12 rounded-full bg-brand-100" />
        </div>
      </div>
    </div>
  );
}
