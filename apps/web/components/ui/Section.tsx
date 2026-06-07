import { cn } from "@/lib/cn";

type Props = {
  id?: string;
  className?: string;
  children: React.ReactNode;
  /** Constrain inner content width. */
  innerClassName?: string;
};

/** Consistent vertical rhythm + centered max-width container for landing sections. */
export function Section({ id, className, children, innerClassName }: Props) {
  return (
    <section id={id} className={cn("px-5 py-20 sm:py-24", className)}>
      <div className={cn("mx-auto w-full max-w-6xl", innerClassName)}>{children}</div>
    </section>
  );
}
