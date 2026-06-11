"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * The signature statement: a giant line that slides horizontally with scroll,
 * with the key word held inside an amber glass pill (its letters glide as you scroll).
 */
export function BigWord() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const x = useTransform(p, [0, 1], ["12vw", "-10vw"]);
  const wordX = useTransform(p, [0, 1], ["0.42em", "-0.42em"]);
  const planeY = useTransform(p, [0, 1], [40, -60]);
  const planeRotate = useTransform(p, [0, 1], [-16, 4]);

  return (
    <section ref={ref} className="relative overflow-x-clip py-28 sm:py-36">
      <motion.div
        aria-hidden
        style={reduce ? undefined : { y: planeY, rotate: planeRotate }}
        className="absolute top-10 left-[14%] sm:top-14"
      >
        <PaperPlane />
      </motion.div>

      <motion.div
        style={reduce ? undefined : { x }}
        className="flex items-center gap-[0.22em] px-5 text-[clamp(3.2rem,10.5vw,9rem)] leading-none font-extrabold tracking-[-0.05em] whitespace-nowrap text-ink"
      >
        <span>You press</span>
        <span className="relative inline-flex h-[1.18em] w-[2.6em] items-center overflow-hidden rounded-[0.32em] bg-[linear-gradient(150deg,#ffd98a_0%,#f8b84e_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(154,98,8,0.25),0_18px_46px_rgba(248,184,78,0.4)]">
          <motion.span
            style={reduce ? undefined : { x: wordX }}
            className="px-[0.18em] text-[#3d2c05]"
          >
            send
          </motion.span>
        </span>
        <span>.</span>
      </motion.div>

      <p className="mt-10 px-5 text-center text-base font-semibold text-muted sm:text-lg">
        The queue prepares everything. The send button stays yours.
      </p>
    </section>
  );
}

function PaperPlane() {
  return (
    <svg width="92" height="74" viewBox="0 0 92 74" fill="none" aria-hidden="true">
      <path
        d="M6 34 84 6 56 64 40 44z"
        fill="#1f64e0"
        stroke="#143f91"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M40 44 84 6 46 50z" fill="#7db4ff" />
      <circle cx="84" cy="6" r="5" fill="#f8b84e" />
      <path
        d="M14 58c6 2 10 6 12 12M4 48c4 1 7 3 9 6"
        stroke="#93c5fd"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
