"use client";

import posthog from "posthog-js";

/** True once PostHog has been initialized (a key was present). */
export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) && posthog.__loaded === true;
}

/**
 * Fire a product event. Safe no-op when PostHog isn't configured, so CTAs can call this
 * unconditionally (design doc §7.2 — instrument every CTA from launch).
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled()) return;
  posthog.capture(event, properties);
}
