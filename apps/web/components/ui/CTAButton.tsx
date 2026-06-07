"use client";

import { buttonClasses } from "./button";
import { track } from "@/lib/analytics";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** PostHog event name fired on click (design doc §7.2 — instrument every CTA). */
  event?: string;
  eventProps?: Record<string, unknown>;
};

/** An anchor styled as a button that fires a PostHog CTA event on click. */
export function CTAButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  event = "cta_click",
  eventProps,
}: Props) {
  return (
    <a
      href={href}
      className={buttonClasses(variant, size, className)}
      onClick={() => track(event, { href, ...eventProps })}
    >
      {children}
    </a>
  );
}
