"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionStyle,
  type Variants,
} from "framer-motion";
import { CheckCircle2, KanbanSquare, ListChecks, PlugZap, Send } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

const JOB_CARDS = [
  {
    company: "Stripe",
    role: "Product Designer",
    source: "Greenhouse",
    fit: "96%",
    status: "Applied",
    color: "#635BFF",
    pattern: "waves",
  },
  {
    company: "Ramp",
    role: "Growth Analyst",
    source: "Lever",
    fit: "91%",
    status: "Interview",
    color: "#0BAA6E",
    pattern: "bars",
  },
  {
    company: "Linear",
    role: "Customer Ops",
    source: "Ashby",
    fit: "88%",
    status: "Queued",
    color: "#5E6AD2",
    pattern: "grid",
  },
  {
    company: "Vercel",
    role: "Staff Engineer",
    source: "Direct",
    fit: "94%",
    status: "Ready",
    color: "#111111",
    pattern: "arc",
  },
] as const;

const BOARD_COLUMNS = [
  {
    label: "Applied",
    count: 18,
    tint: "bg-brand-600",
    cards: [
      { company: "Stripe", role: "Product design", meta: "96% fit" },
      { company: "Notion", role: "Research", meta: "extension" },
    ],
  },
  {
    label: "Interview",
    count: 5,
    tint: "bg-aqua",
    cards: [
      { company: "Ramp", role: "Growth", meta: "reply today" },
      { company: "Figma", role: "PMM", meta: "screen booked" },
    ],
  },
  {
    label: "Offer",
    count: 2,
    tint: "bg-mint",
    cards: [
      { company: "Linear", role: "Customer ops", meta: "final loop" },
      { company: "Ashby", role: "Growth PM", meta: "waiting" },
    ],
  },
] as const;

const PROOF_CHIPS = [
  { label: "Auto logged", value: "18", icon: Send },
  { label: "Status synced", value: "5", icon: CheckCircle2 },
  { label: "Captured via extention", value: "12", icon: PlugZap },
  { label: "From Daily queue", value: "17", icon: ListChecks },
] as const;

/**
 * Visual product demo for the self filling tracker. The section is intentionally
 * demo led, with a card gallery and live board carrying the idea before copy.
 */
export function JobTrackerShowcase() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const stripeX = useTransform(scrollYProgress, [0.08, 0.42], [-170, 0]);
  const stripeY = useTransform(scrollYProgress, [0.08, 0.42], [110, 0]);
  const stripeRotate = useTransform(scrollYProgress, [0.08, 0.42], [-18, -5]);
  const stripeScale = useTransform(scrollYProgress, [0.08, 0.42], [0.9, 1]);
  const stripeOpacity = useTransform(scrollYProgress, [0.08, 0.42], [0, 0.7]);

  const rampX = useTransform(scrollYProgress, [0.1, 0.44], [170, 0]);
  const rampY = useTransform(scrollYProgress, [0.1, 0.44], [82, 0]);
  const rampRotate = useTransform(scrollYProgress, [0.1, 0.44], [16, 5]);
  const rampScale = useTransform(scrollYProgress, [0.1, 0.44], [0.9, 1]);
  const rampOpacity = useTransform(scrollYProgress, [0.1, 0.44], [0, 0.76]);

  const linearX = useTransform(scrollYProgress, [0.14, 0.48], [-120, 0]);
  const linearY = useTransform(scrollYProgress, [0.14, 0.48], [170, 0]);
  const linearRotate = useTransform(scrollYProgress, [0.14, 0.48], [14, 4]);
  const linearScale = useTransform(scrollYProgress, [0.14, 0.48], [0.88, 1]);
  const linearOpacity = useTransform(scrollYProgress, [0.14, 0.48], [0, 0.6]);

  const vercelX = useTransform(scrollYProgress, [0.14, 0.48], [150, 0]);
  const vercelY = useTransform(scrollYProgress, [0.14, 0.48], [160, 0]);
  const vercelRotate = useTransform(scrollYProgress, [0.14, 0.48], [-14, -4]);
  const vercelScale = useTransform(scrollYProgress, [0.14, 0.48], [0.88, 1]);
  const vercelOpacity = useTransform(scrollYProgress, [0.14, 0.48], [0, 0.6]);

  const boardY = useTransform(scrollYProgress, [0.06, 0.38], [88, 0]);
  const boardScale = useTransform(scrollYProgress, [0.06, 0.38], [0.92, 1]);
  const boardOpacity = useTransform(scrollYProgress, [0.06, 0.38], [0.35, 1]);

  const proofX = useTransform(scrollYProgress, [0.16, 0.5], [150, 0]);
  const proofY = useTransform(scrollYProgress, [0.16, 0.5], [50, 0]);
  const proofScale = useTransform(scrollYProgress, [0.16, 0.5], [0.92, 1]);
  const proofOpacity = useTransform(scrollYProgress, [0.16, 0.5], [0, 1]);

  const stripeStyle = reduce
    ? undefined
    : { x: stripeX, y: stripeY, rotate: stripeRotate, scale: stripeScale, opacity: stripeOpacity };
  const rampStyle = reduce
    ? undefined
    : { x: rampX, y: rampY, rotate: rampRotate, scale: rampScale, opacity: rampOpacity };
  const linearStyle = reduce
    ? undefined
    : { x: linearX, y: linearY, rotate: linearRotate, scale: linearScale, opacity: linearOpacity };
  const vercelStyle = reduce
    ? undefined
    : { x: vercelX, y: vercelY, rotate: vercelRotate, scale: vercelScale, opacity: vercelOpacity };
  const boardStyle = reduce ? undefined : { y: boardY, scale: boardScale, opacity: boardOpacity };
  const proofStyle = reduce ? undefined : { x: proofX, y: proofY, scale: proofScale, opacity: proofOpacity };

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden px-3 py-20 sm:px-5 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#ffffff_0%,#f4f7fb_48%,#ffffff_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-24 -z-10 h-[32rem] rotate-[-7deg] bg-[linear-gradient(90deg,transparent,rgba(31,100,224,0.07),transparent)]"
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.35 }}
        className="mx-auto w-full max-w-7xl"
      >
        <div className="grid items-end gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(7,26,51,0.2)]">
              <KanbanSquare className="size-4" />
              Job tracker
            </span>
            <h2 className="mt-5 max-w-2xl text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-6xl">
              Tracker so good you will fall in{" "}
              <span className="text-[#ef7078] [text-shadow:0_0_18px_rgba(239,112,120,0.34)]">
                love
              </span>
            </h2>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="max-w-xl text-base leading-7 text-pretty text-muted sm:text-lg lg:justify-self-end"
          >
            Every send lands on the board with its resume, status, source, and next step already
            attached. You get the view, without becoming the data entry person.
          </motion.p>
        </div>

        <div className="relative mt-12 lg:min-h-[32rem]">
          <motion.div
            variants={stagger}
            className="pointer-events-none absolute inset-x-0 top-0 hidden h-full lg:block"
          >
            <FloatingJobCard
              card={JOB_CARDS[0]}
              className="absolute left-[6%] top-16 w-52 opacity-70"
              rotate={-5}
              delay={0.02}
              style={stripeStyle}
            />
            <FloatingJobCard
              card={JOB_CARDS[1]}
              className="absolute right-[34%] bottom-10 w-52 opacity-75"
              rotate={5}
              delay={0.14}
              style={rampStyle}
            />
            <FloatingJobCard
              card={JOB_CARDS[2]}
              className="absolute bottom-8 left-[15%] w-52 opacity-60"
              rotate={4}
              delay={0.26}
              style={linearStyle}
            />
            <FloatingJobCard
              card={JOB_CARDS[3]}
              className="absolute bottom-6 right-[16%] w-52 opacity-60"
              rotate={-4}
              delay={0.38}
              style={vercelStyle}
            />
          </motion.div>

          <div className="relative z-10 mx-auto grid max-w-6xl gap-4 lg:grid-cols-[0.38fr_minmax(0,1fr)_0.38fr] lg:items-center xl:gap-5">
            <div aria-hidden className="hidden lg:block" />
            <motion.div
              style={boardStyle}
              variants={reduce ? fadeUp : undefined}
              className="order-1 lg:order-2"
            >
              <PipelineBoard reduce={Boolean(reduce)} />
            </motion.div>

            <ProofPanel style={proofStyle} />
          </div>

          <motion.div
            variants={stagger}
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:hidden"
          >
            {JOB_CARDS.map((card, index) => (
              <FloatingJobCard key={card.company} card={card} delay={index * 0.08} />
            ))}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function FloatingJobCard({
  card,
  className = "",
  rotate = 0,
  delay = 0,
  style,
}: {
  card: (typeof JOB_CARDS)[number];
  className?: string;
  rotate?: number;
  delay?: number;
  style?: MotionStyle;
}) {
  const hasScrollFlow = Boolean(style);

  return (
    <motion.article
      style={style}
      variants={
        hasScrollFlow
          ? undefined
          : {
              hidden: { opacity: 0, y: 42, rotate: rotate * 0.45 },
              show: {
                opacity: 1,
                y: 0,
                rotate,
                transition: { duration: 0.75, delay, ease: EASE },
              },
            }
      }
      whileHover={hasScrollFlow ? undefined : { y: -8, rotate: 0, transition: { duration: 0.22 } }}
      className={`rounded-2xl bg-white p-4 text-ink shadow-[0_18px_48px_-30px_rgba(7,26,51,0.46)] ring-1 ring-black/5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <CompanyBadge name={card.company} color={card.color} />
        <span className="rounded-full bg-mint px-2.5 py-1 text-[10px] font-black text-[#04241a]">
          {card.fit} fit
        </span>
      </div>
      <p className="mt-4 text-xs font-bold text-muted">{card.source}</p>
      <h3 className="mt-1 text-xl font-black tracking-[-0.03em] text-balance">{card.role}</h3>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[9px] font-black text-ink/80">
        <Metric label="Status" value={card.status} />
        <Metric label="Resume" value="Fresh" />
        <Metric label="Next" value="Tracked" />
      </div>
      <CardPattern pattern={card.pattern} color={card.color} />
    </motion.article>
  );
}

function PipelineBoard({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative mx-auto max-w-2xl rounded-2xl bg-ink p-2 text-white shadow-[0_30px_70px_-36px_rgba(7,26,51,0.55)]">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-2xl bg-[radial-gradient(circle_at_50%_0%,rgba(31,100,224,0.16),transparent_62%)] blur-2xl"
      />
      <div className="overflow-hidden rounded-xl bg-[linear-gradient(180deg,#121b31_0%,#07111f_100%)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-ink">
              <KanbanSquare className="size-4" />
            </span>
            <p className="text-sm font-black">Your pipeline</p>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
          {BOARD_COLUMNS.map((column, columnIndex) => (
            <motion.div
              key={column.label}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{ duration: 0.55, delay: 0.12 + columnIndex * 0.08, ease: EASE }}
              className="relative rounded-xl bg-white/[0.055] p-3 ring-1 ring-white/10 ring-inset"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-white/60">
                  {column.label}
                </p>
                <span className={`grid size-6 place-items-center rounded-full text-[11px] font-black ${column.tint}`}>
                  {column.count}
                </span>
              </div>
              <div className="space-y-2">
                {column.cards.map((card, index) => (
                  <PipelineMiniCard
                    key={`${column.label}-${card.company}`}
                    card={card}
                    delay={columnIndex * 0.12 + index * 0.08}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProofPanel({ style }: { style?: MotionStyle }) {
  return (
    <motion.div
      style={style}
      variants={stagger}
      className="order-3 rounded-2xl bg-white/95 p-3 shadow-[0_18px_48px_-34px_rgba(7,26,51,0.44)] ring-1 ring-black/5"
    >
      <div className="px-1 pb-2">
        <p className="text-sm font-black tracking-[-0.02em] text-ink">Today</p>
      </div>
      <div className="space-y-2">
        {PROOF_CHIPS.map((chip, index) => {
          const Icon = chip.icon;

          return (
            <motion.div
              key={chip.label}
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.45, delay: index * 0.04, ease: EASE },
                },
              }}
              className="flex items-center gap-3 rounded-xl bg-panel px-3 py-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-black tracking-[-0.03em] text-ink">{chip.value}</p>
                <p className="truncate text-[11px] font-black text-muted">{chip.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function PipelineMiniCard({
  card,
  delay,
}: {
  card: { company: string; role: string; meta: string };
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.48, delay: 0.2 + delay, ease: EASE }}
      className="rounded-lg bg-white p-2.5 text-ink shadow-[0_10px_24px_-18px_rgba(0,0,0,0.36)]"
    >
      <div className="flex items-center gap-2">
        <CompanyBadge name={card.company} />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black">{card.company}</p>
          <p className="truncate text-[9px] font-bold text-muted">{card.role}, {card.meta}</p>
        </div>
      </div>
    </motion.div>
  );
}

function CompanyBadge({ name, color }: { name: string; color?: string }) {
  const initial = name.slice(0, 1);
  const bg = color ?? "#1f64e0";

  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function CardPattern({
  pattern,
  color,
}: {
  pattern: (typeof JOB_CARDS)[number]["pattern"];
  color: string;
}) {
  if (pattern === "waves") {
    return (
      <svg viewBox="0 0 160 48" aria-hidden className="mt-4 h-10 w-full">
        {[0, 1, 2].map((row) => (
          <path
            key={row}
            d={`M${8 + row * 4} ${34 - row * 6} C 36 ${8 + row * 4}, 58 ${48 - row * 3}, 88 ${22 + row * 2} S 132 ${20 - row}, 154 ${8 + row * 5}`}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            opacity={0.8 - row * 0.18}
          />
        ))}
      </svg>
    );
  }

  if (pattern === "bars") {
    return (
      <div className="mt-4 flex h-10 items-end gap-1.5">
        {[28, 42, 20, 36, 46, 30].map((height, index) => (
          <span
            key={index}
            className="w-full rounded-t-full"
            style={{ height, backgroundColor: color, opacity: 0.35 + index * 0.08 }}
          />
        ))}
      </div>
    );
  }

  if (pattern === "grid") {
    return (
      <div className="mt-4 grid h-10 grid-cols-8 gap-1">
        {Array.from({ length: 24 }).map((_, index) => (
          <span
            key={index}
            className="rounded-[0.2rem]"
            style={{ backgroundColor: color, opacity: index % 3 === 0 ? 0.8 : 0.24 }}
          />
        ))}
      </div>
    );
  }

  return (
    <svg viewBox="0 0 160 48" aria-hidden className="mt-4 h-10 w-full">
      <path d="M24 44 A 52 52 0 0 1 136 44" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <path d="M54 44 A 24 24 0 0 1 106 44" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.42" />
    </svg>
  );
}
