"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

type Props = {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  format?: (value: number) => string;
};

/** Animates a number from → to once it scrolls into view. */
export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  delay = 0,
  className,
  format = (value) => Math.round(value).toLocaleString("en-US"),
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(from, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setValue(latest),
    });
    return () => controls.stop();
  }, [inView, reduce, from, to, duration, delay]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
