"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Inertia smooth-scrolling via Lenis. Wheel input is interpolated each frame, so
 * scroll-linked Framer Motion values glide instead of stepping with wheel ticks.
 * Disabled for users who prefer reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.105,
      wheelMultiplier: 1,
      anchors: { offset: -96 },
      prevent: (node) => Boolean(node.closest("[data-lenis-prevent]")),
    });

    let frame = requestAnimationFrame(function loop(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
