"use client";

import { useEffect, useRef, useState } from "react";
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
  const isTablet = useMediaQuery("(min-width: 640px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isUltraWide = useMediaQuery("(min-width: 1800px)");

  const travel = isUltraWide
    ? ["0vw", "-58vw"]
    : isDesktop
      ? ["0vw", "-54vw"]
      : isTablet
        ? ["0vw", "-42vw"]
        : ["0vw", "0vw"];
  const x = useTransform(p, [0, 0.28, 1], [travel[0], travel[0], travel[1]]);
  const wordX = useTransform(p, [0, 1], ["0.22em", "-0.22em"]);
  const planeY = useTransform(p, [0, 1], [40, -60]);
  const planeRotate = useTransform(p, [0, 1], [-16, 4]);

  return (
    <section ref={ref} className="relative overflow-x-clip px-4 py-24 sm:py-32 lg:py-36">
      <motion.div
        aria-hidden
        style={reduce ? undefined : { y: planeY, rotate: planeRotate }}
        className="absolute top-10 left-[14%] sm:top-14"
      >
        <PaperPlane />
      </motion.div>

      <motion.div
        style={{
          ...(reduce ? undefined : { x }),
          fontSize: "clamp(4rem, min(9vw, calc((100vw - 5rem) / 10.8)), 9rem)",
        }}
        className="mx-auto flex flex-wrap items-center justify-center gap-x-[0.22em] gap-y-[0.16em] leading-none font-extrabold tracking-[-0.04em] text-ink sm:flex-nowrap sm:whitespace-nowrap"
      >
        <span>Applied</span>
        <span>Auto</span>
        <span className="relative inline-flex h-[1.18em] w-[5.25em] shrink-0 items-center overflow-hidden rounded-[0.32em] bg-[linear-gradient(150deg,#ffd98a_0%,#f8b84e_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(154,98,8,0.25),0_18px_46px_rgba(248,184,78,0.4)]">
          <motion.span
            style={reduce ? undefined : { x: wordX }}
            className="px-[0.2em] text-[#3d2c05]"
          >
            Magically
          </motion.span>
        </span>
      </motion.div>

      <p className="mt-10 px-5 text-center text-base font-semibold text-muted sm:text-lg">
        No send button to press. JobPosted applies for you, you just check in once a day.
      </p>
    </section>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
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
