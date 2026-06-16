"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "h-11 px-5 text-sm",
  md: "h-12 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

export function AnimatedGetStartedButton({
  href,
  children = "Get started",
  className,
  size = "lg",
}: {
  href: ComponentProps<typeof Link>["href"];
  children?: ReactNode;
  className?: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "animated-get-started group relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-extrabold text-white transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden className="animated-get-started__sheen" />
      <span className="relative z-10">{children}</span>
      <ArrowRight
        aria-hidden
        className="relative z-10 size-4 shrink-0 text-white transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
