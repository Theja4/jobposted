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
import { BellRing, Check, Moon, Radar } from "lucide-react";
import { CountUp } from "@/components/ui/CountUp";

const EASE = [0.22, 1, 0.36, 1] as const;

const MISSED_ROLES = [
  { role: "Operations Lead", company: "Stripe", fit: "94%", logo: "stripe", color: "#635BFF" },
  { role: "Product Analyst", company: "Airbnb", fit: "91%", logo: "airbnb", color: "#FF385C" },
  { role: "Growth PM", company: "Notion", fit: "89%", logo: "notion", color: "#111111" },
] as const;

const LOGO_DATA_URIS = {
  lever:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAMAAABg3Am1AAAAMFBMVEVHp6LE/9Sc48R4ybWu78tSr6ay8s1rwLDA/NJguKyAz7hMqqS5989btaqn68iQ2r/YIAuOAAAAXUlEQVRIie3VsQ6AIAxFUUAqIij//7cmstBI2jrz7tyTtCw4t3o59cgKwtHbzMC/AQAAAADo4KSxogJf96GYdMCq109wG1ZiNf1olvhkU5AF0OK3IH14hSYJ88v0AOwqBOY5ZzBqAAAAAElFTkSuQmCC",
  ashby:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAM1BMVEVHPND///9KPtE5K81IO9FFOclHO85JPNRIPdRHcExhWdTn5veppeTJx+4MAMmGgdwnEssw9PVGAAAACnRSTlPt////XyH/usoAai4gUQAABCJJREFUeJztm+u2mzoMhMEGcrjz/k9bwCblorElkYTTtaz2R9duwB/SMJZgJ6vrsng9FEVZ11ldZuaxyMo6K7PqwZiXL8yTAFWRvZ4FyLL/EkACSAAJIAEkgATw7wIY8p+/A7C7mB4AsF2+i8b+GsBU7R6g+zmAHffr561RJlILYIb+AJCPVkegz8Bx/bwdfgtwqsAcRqcCJYCx/RlAKUMtgGnPAK3OjXQA5mgCd2SoBBguCcjzXiVDZQma6/qzGypOpASgKqCUoQrgZMO3ZKgDICuwyPA3ABcbviNDVQYmev08F59JB3C14RsyVAAQNnxDhhqAqw3fkKEcwOAKaGSoAKBs+B3fL8G87a/V/lQN5BlwNjwCIYplqMjAuvRE7ga5fEeSZ6BxYqs+JEMpgHGXPlZQikIRiAHWhdvAzSh0Q3EJXAUs2pKX/xOdUAjgJbhMgnRTspbnmwDuupdh2IKmQChDGYCv/LoEdkSRCIQArhVxScY1kBAIS7BOhK2TGdwVW4kMZQCuAtuNBvuC5lsAu3tgBfiEDGUZaFYX2k6PZTh9B8DbcLed3sAdSSBDEYC74r/7HZoPJG4oAXA132scy5B7ThmAq8AuvXhHYqtAAOBt+PAoBsuQeVIBgHEVPzyMgkMaX4YCALfYMbn3ZSgAcBPh0eXwlMR1Qz6A3whPV3ZbhgKAnqzt+YHlFtwHl2wAs9rwvNeffgljuilDNsDWikznuClDLoC34b67BrICngz5JQDL4ODJkAsA+69AsGTIBDA2NJODYL3G4WbASa2lAwCwZMgD8K1HT19Sg5pTzmscJsDgcno2ARdQHxwZMkvgNsLl4cP1L25OOW7IA3A23IGa4uaU4YYsAD+CQFXDHYkhQw6AnwhxQuGo3sbdkAVAtSKHgF1BXIY8DawnC1zNDRlyAHwFAvXEMoy6IQPA23BI0XhGisqQkwGX3/CsAWsQc8M4gL+6cDVxc4rMQwDg6hvRM7SCmAzjAH4ijKVSK0MGQMcRE56RIg8uowDe5eKurpRhFMAXN7Z8oGcKv9SOAfjUMp76KGUYBZhyXgXwjBSWYQzA2zCjuVLKMArgKsBpL3ENQq9xYgBN/Bq2wDIMuWEYYEsrq8PHzWlIhmGAbZ9nzq/ICkIaDgK8k8p9hIAAAiqAAEu//y7qvBNF74P5AxBg8RFwAhJg+bAdhvEtqnYcBut+DmDnA6YhMMB202DJw2mApmnG/qDpth/H+adkV7J8fD4APijwCPPxPIDQ7wcQ98PatDNnZ8JPZADUDRl8na8CwF3+bQCisyY10OC4fLbaNMCK68EkgMVBAYQ+Hz2c9gED/5Bh6LmdHuZZAD+MBJAAEkACSAAJ4H8A8PjXfotH169ez37122RFVpfaL8h8YH1T1Fldl6+HkpC9irr+A+PhUqjpOZ0SAAAAAElFTkSuQmCC",
} as const;

/**
 * Dark bento for the always-on scout. The motion shell stays intact: cards
 * still drift, reveal, tilt, and catch cursor light, while the surfaces borrow
 * the reference image's matte black dashboard tiles and blue signal glow.
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
      title: "Passive search while you sleep",
      accent: "rgba(125,180,255,0.5)",
      rest: -1.4,
      visual: <RadarSweep reduce={Boolean(reduce)} />,
      motif: <DotsMotif className="top-5 right-5" />,
    },
    {
      title: "Major job boards in view",
      accent: "rgba(22,199,212,0.45)",
      rest: 1.1,
      visual: <FreshMatch reduce={Boolean(reduce)} />,
      motif: <RingsMotif className="-top-8 -right-8" />,
    },
    {
      title: "High-fit roles stay caught",
      accent: "rgba(125,180,255,0.4)",
      rest: 0,
      tall: true,
      visual: <MissedQueue reduce={Boolean(reduce)} />,
      motif: <SquiggleMotif className="top-5 left-5" />,
    },
    {
      title: "Review batch stays focused",
      accent: "rgba(22,199,212,0.5)",
      rest: 1.2,
      visual: <FitGauge reduce={Boolean(reduce)} />,
      motif: <DotsMotif className="-bottom-2 left-5" />,
    },
    {
      title: "Coverage keeps climbing",
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
        "bg-[linear-gradient(165deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_30%,rgba(69,122,255,0.2)_66%,rgba(255,255,255,0.04))] " +
        "shadow-[0_26px_60px_-22px_rgba(0,0,0,0.95)] hover:shadow-[0_44px_110px_-30px_rgba(31,100,224,0.5)]"
      }
    >
      <div
        className={
          "relative flex h-full flex-col overflow-hidden rounded-[calc(1.7rem-1px)] bg-[#0a0b0f] p-5 sm:p-6 " +
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
          className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.055),transparent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:46px_46px]"
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
          className="pointer-events-none absolute -bottom-16 left-1/2 h-36 w-4/5 -translate-x-1/2 rounded-full opacity-55 blur-3xl transition-opacity duration-500 group-hover:opacity-90"
          style={{ background: `radial-gradient(ellipse, ${accent}, transparent 70%)` }}
        />
        {/* decorative motif */}
        {motif}

        <h3 className="relative z-10 max-w-[12rem] text-sm leading-5 font-semibold tracking-[0] text-white/78">
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
  name: "vercel" | "greenhouse" | "lever" | "ashby" | "stripe" | "airbnb" | "notion";
  className?: string;
}) {
  if (name === "vercel") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d="m12 1.608 12 20.784H0Z" />
      </svg>
    );
  }

  if (name === "stripe") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path
          d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
        />
      </svg>
    );
  }

  if (name === "airbnb") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path
          d="M12.001 18.275c-1.353-1.697-2.148-3.184-2.413-4.457-.263-1.027-.16-1.848.291-2.465.477-.71 1.188-1.056 2.121-1.056s1.643.345 2.12 1.063c.446.61.558 1.432.286 2.465-.291 1.298-1.085 2.785-2.412 4.458zm9.601 1.14c-.185 1.246-1.034 2.28-2.2 2.783-2.253.98-4.483-.583-6.392-2.704 3.157-3.951 3.74-7.028 2.385-9.018-.795-1.14-1.933-1.695-3.394-1.695-2.944 0-4.563 2.49-3.927 5.382.37 1.565 1.352 3.343 2.917 5.332-.98 1.085-1.91 1.856-2.732 2.333-.636.344-1.245.558-1.828.609-2.679.399-4.778-2.2-3.825-4.88.132-.345.395-.98.845-1.961l.025-.053c1.464-3.178 3.242-6.79 5.285-10.795l.053-.132.58-1.116c.45-.822.635-1.19 1.351-1.643.346-.21.77-.315 1.246-.315.954 0 1.698.558 2.016 1.007.158.239.345.557.582.953l.558 1.089.08.159c2.041 4.004 3.821 7.608 5.279 10.794l.026.025.533 1.22.318.764c.243.613.294 1.222.213 1.858zm1.22-2.39c-.186-.583-.505-1.271-.9-2.094v-.03c-1.889-4.006-3.642-7.608-5.307-10.844l-.111-.163C15.317 1.461 14.468 0 12.001 0c-2.44 0-3.476 1.695-4.535 3.898l-.081.16c-1.669 3.236-3.421 6.843-5.303 10.847v.053l-.559 1.22c-.21.504-.317.768-.345.847C-.172 20.74 2.611 24 5.98 24c.027 0 .132 0 .265-.027h.372c1.75-.213 3.554-1.325 5.384-3.317 1.829 1.989 3.635 3.104 5.382 3.317h.372c.133.027.239.027.265.027 3.37.003 6.152-3.261 4.802-6.975z"
        />
      </svg>
    );
  }

  if (name === "notion") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path
          d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"
        />
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
    <div className="relative flex w-full flex-col items-center justify-center self-stretch text-center">
      <p className="mx-auto max-w-40 text-xs leading-5 font-medium text-white/72">
        Fresh matches generated while you sleep.
      </p>

      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={reduce ? undefined : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        className="relative mt-6 w-full max-w-[14.5rem] rounded-2xl p-px bg-[linear-gradient(145deg,rgba(255,255,255,0.25),rgba(255,255,255,0.04)_42%,rgba(69,122,255,0.22))] shadow-[0_22px_54px_rgba(0,0,0,0.42)]"
      >
        <div className="relative overflow-hidden rounded-[calc(1rem-1px)] bg-[#111318] p-3.5 ring-1 ring-white/10 ring-inset">
          {!reduce && (
            <motion.span
              aria-hidden
              animate={{ x: ["-140%", "150%"] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
              className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
            />
          )}
          <div className="flex items-center gap-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(155deg,#294375,#111827)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <Moon className="size-5 text-[#9bbcff]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base leading-none font-extrabold tracking-[-0.02em] text-white">
                +3 roles
              </p>
              <p className="mt-1 text-xs font-medium text-white/50">Added to your queue</p>
            </div>
            <BellRing className="size-4 shrink-0 text-[#83aaff]" />
          </div>
        </div>
      </motion.div>

      <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-extrabold text-white/82 ring-1 ring-white/14 ring-inset">
        <Check className="size-3.5 text-[#9bbcff]" strokeWidth={3} />
        Found
      </span>
    </div>
  );
}

function FreshMatch({ reduce }: { reduce: boolean }) {
  const boards = [
    { name: "greenhouse", label: "Greenhouse", color: "#00A86B", x: "13%", y: "23%", rotate: -9 },
    { name: "lever", label: "Lever", color: "#47A762", x: "38%", y: "10%", rotate: 7 },
    { name: "ashby", label: "Ashby", color: "#473DD0", x: "58%", y: "32%", rotate: 10 },
  ] as const;

  return (
    <div className="relative h-40 w-full max-w-[16rem]">
      <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(69,122,255,0.18),transparent_68%)]" />
      {boards.map((board, index) => (
        <motion.div
          key={board.name}
          initial={reduce ? false : { opacity: 0, y: 18, rotate: board.rotate - 8 }}
          whileInView={{ opacity: 1, y: 0, rotate: board.rotate }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ delay: index * 0.1, duration: 0.56, ease: EASE }}
          style={{ left: board.x, top: board.y }}
          className="absolute grid size-20 place-items-center rounded-[1.15rem] border border-white/12 bg-[#151820] shadow-[0_18px_36px_rgba(0,0,0,0.42)]"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" style={{ color: board.color }}>
            <CompanyLogo
              name={board.name}
              className={board.name === "greenhouse" ? "size-6" : "size-11"}
            />
          </span>
          <span className="sr-only">{board.label}</span>
        </motion.div>
      ))}
      <p className="absolute inset-x-0 bottom-1 text-center text-xs font-medium text-white/60">
        Niche boards, checked quietly.
      </p>
    </div>
  );
}

function MissedQueue({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative flex w-full flex-1 flex-col justify-between self-stretch overflow-hidden rounded-3xl">
      {!reduce && (
        <motion.span
          aria-hidden
          animate={{ y: ["-15%", "115%"] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 rounded-full bg-[linear-gradient(180deg,transparent,rgba(125,180,255,0.12),transparent)]"
        />
      )}

      <p className="mx-auto max-w-[13rem] text-center text-xs leading-5 font-medium text-white/66">
        The queue filters broad searches into roles worth opening.
      </p>

      <div className="relative my-6 flex min-h-[13.5rem] items-end justify-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24, scale: 0.94 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="absolute top-0 text-[6.9rem] leading-none font-black tracking-[-0.07em] text-[#376eff] drop-shadow-[0_0_32px_rgba(69,122,255,0.55)] sm:text-[7.8rem]"
        >
          <CountUp to={94} from={62} duration={1.2} />%
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ delay: 0.18, duration: 0.62, ease: EASE }}
          className="relative z-10 w-full max-w-[13.5rem] rounded-[1.3rem] bg-[#202124] p-5 shadow-[0_24px_55px_rgba(0,0,0,0.52)] ring-1 ring-white/10 ring-inset"
        >
          <div className="mx-auto flex h-12 w-24 items-center justify-center">
            <span className="grid size-12 place-items-center rounded-full bg-[linear-gradient(145deg,#4a4a4a,#1c1d20)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_22px_rgba(0,0,0,0.45)]" />
            <span className="-ml-4 grid size-12 place-items-center rounded-full border border-white/14 bg-[#15171d]" />
          </div>
          <p className="mt-4 text-center text-xs font-semibold text-white/58">Fit threshold active</p>
        </motion.div>
      </div>

      {MISSED_ROLES.map((job, index) => (
        <motion.article
          key={job.role}
          initial={reduce ? false : { opacity: 0, x: 30, rotate: 1.5 }}
          whileInView={{ opacity: 1, x: 0, rotate: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 0.18 + index * 0.14, duration: 0.55, ease: EASE }}
          whileHover={reduce ? undefined : { x: 5, transition: { duration: 0.2 } }}
          className="rounded-2xl p-px bg-[linear-gradient(160deg,rgba(255,255,255,0.18),rgba(255,255,255,0.035)_48%,rgba(125,180,255,0.12))]"
        >
          <div className="flex items-center gap-3 rounded-[calc(1rem-1px)] bg-[#111318] p-3 ring-1 ring-white/[0.04] ring-inset">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_rgba(0,0,0,0.14)] ring-1 ring-white/55 ring-inset"
              style={{ color: job.color }}
            >
              <CompanyLogo name={job.logo} className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{job.role}</p>
              <p className="text-xs font-medium text-white/45">{job.company}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#1e3a8a] px-2.5 py-1 text-[10px] font-black text-[#dce8ff] shadow-[0_0_18px_rgba(69,122,255,0.28),inset_0_1px_0_rgba(255,255,255,0.24)]">
              {job.fit} fit
            </span>
          </div>
        </motion.article>
      ))}

    </div>
  );
}

function FitGauge({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative flex w-full flex-col items-center justify-center self-stretch text-center">
      <p className="text-xs font-semibold text-white/78">Roles queued today</p>

      <div className="relative mt-6 grid size-24 place-items-center">
        <span className="absolute inset-3 rounded-[1.3rem] bg-[#1b1d22] shadow-[0_18px_40px_rgba(0,0,0,0.45)]" />
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.45, 0.78, 0.45] }}
          transition={reduce ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-[1.65rem] bg-[radial-gradient(circle,rgba(69,122,255,0.34),transparent_68%)] blur-sm"
        />
        <span className="relative grid size-[4.75rem] place-items-center rounded-2xl bg-[linear-gradient(145deg,#2a2d34,#111318)] text-4xl font-black tracking-[-0.05em] text-[#9cbcff] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_16px_36px_rgba(0,0,0,0.5)] ring-1 ring-white/10 ring-inset">
          <CountUp to={18} from={4} duration={1.1} />
        </span>
      </div>

      <p className="mt-7 max-w-[11rem] text-xs leading-5 font-medium text-white/55">
        Tight batch, ready for your review.
      </p>
    </div>
  );
}

function OvernightSends({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative w-full max-w-[16rem] overflow-hidden rounded-2xl border border-[#7aa2ff]/28 bg-[linear-gradient(135deg,#0d1c55,#214ef0_54%,#0d1225)] p-4 shadow-[0_22px_52px_rgba(31,100,224,0.24)]">
      <div className="absolute inset-0 bg-[radial-gradient(11rem_8rem_at_86%_12%,rgba(255,255,255,0.18),transparent_64%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:54px_42px]" />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-white/86">Role discovery</p>
        <Radar className="size-4 text-white/70" />
      </div>

      <svg viewBox="0 0 220 110" className="relative mt-4 h-20 w-full overflow-visible">
        <defs>
          <linearGradient id="coverageArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {[28, 62, 96].map((y) => (
          <line key={y} x1="0" y1={y} x2="220" y2={y} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 7" />
        ))}
        <path
          d="M0 86 C32 72, 48 88, 76 82 S126 35, 158 44 S194 65, 220 48 L220 110 L0 110 Z"
          fill="url(#coverageArea)"
        />
        <motion.path
          d="M0 86 C32 72, 48 88, 76 82 S126 35, 158 44 S194 65, 220 48"
          fill="none"
          stroke="#9fc0ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.35, ease: EASE }}
        />
        <line x1="158" y1="0" x2="158" y2="110" stroke="rgba(255,255,255,0.2)" strokeDasharray="3 6" />
        <motion.circle
          cx="158"
          cy="44"
          r="4.5"
          fill="#0d1c55"
          stroke="white"
          strokeWidth="2"
          initial={{ scale: reduce ? 1 : 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: 0.85, type: "spring", stiffness: 340, damping: 17 }}
        />
      </svg>

      <p className="relative mt-1 text-3xl font-black tracking-[-0.04em] text-[#a7c3ff]">
        +<CountUp to={805} from={260} duration={1.2} /> roles
      </p>
      <p className="relative mt-1 text-xs font-medium text-white/68">New sources scanned today.</p>
    </div>
  );
}
