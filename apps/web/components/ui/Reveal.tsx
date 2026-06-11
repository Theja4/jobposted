"use client";

import { motion, useReducedMotion } from "framer-motion";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in seconds for sequenced reveals. */
  delay?: number;
  amount?: number;
};

/**
 * Slight rise on scroll-into-view. Avoid filter-based reveals: browser back/forward
 * restoration can leave sections stuck with a blur filter before in-view state settles.
 */
export function Reveal({ children, className, delay = 0, amount = 0.22 }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0.9, y: 24, scale: 0.992 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
