"use client";

import { motion, useReducedMotion } from "framer-motion";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in seconds for sequenced reveals. */
  delay?: number;
};

/**
 * Fade + slight rise on scroll-into-view. Transform/opacity only, 220ms, once (design doc
 * §23.9). Honors prefers-reduced-motion by rendering statically.
 */
export function Reveal({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
