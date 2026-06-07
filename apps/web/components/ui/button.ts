import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/20",
  secondary:
    "bg-white text-ink ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 active:bg-zinc-100",
  ghost: "text-brand-700 hover:bg-brand-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

/** Shared button/anchor styling so links and form buttons look identical. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap",
    "transition-[transform,background-color,box-shadow] duration-150 ease-out",
    "hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}
