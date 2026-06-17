import { Eye, FileCheck2, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

const CONTROL_POINTS = [
  {
    title: "Nothing leaves without you",
    body: "Prepared applications wait in your queue so you can review the resume, answers, and employer requirements before submitting.",
    icon: ShieldCheck,
  },
  {
    title: "Tailoring stays inspectable",
    body: "You can see which resume is attached and make edits before using it on an employer form.",
    icon: FileCheck2,
  },
  {
    title: "Your tracker stays current",
    body: "Queued, manual, and extension-assisted applications are logged so you know what happened and what still needs attention.",
    icon: Eye,
  },
] as const;

export function Reviews() {
  return (
    <section className="relative isolate bg-transparent px-5 pt-20 pb-10 sm:pt-24 sm:pb-12">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold text-brand-700">Built for control</p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            Automation you can inspect before it counts.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.08fr_1fr] lg:items-stretch">
          <Reveal delay={0.04} className="h-full">
            <ControlCard point={CONTROL_POINTS[0]} featured />
          </Reveal>

          <div className="grid gap-5">
            <Reveal delay={0.16}>
              <ControlCard point={CONTROL_POINTS[1]} compact />
            </Reveal>
            <Reveal delay={0.22}>
              <ControlCard point={CONTROL_POINTS[2]} compact />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlCard({
  point,
  compact = false,
  featured = false,
}: {
  point: (typeof CONTROL_POINTS)[number];
  compact?: boolean;
  featured?: boolean;
}) {
  const Icon = point.icon;

  return (
    <article
      className={
        featured
          ? "relative flex h-full min-h-[19rem] flex-col overflow-hidden rounded-2xl bg-[#1e7bff] p-6 text-white shadow-[0_18px_46px_rgba(30,123,255,0.24)]"
          : "relative flex h-full flex-col overflow-hidden rounded-2xl bg-white/82 p-6 text-ink ring-1 ring-inset ring-white/90 " +
            (compact ? "min-h-[13rem]" : "min-h-[19rem]")
      }
    >
      <span
        aria-hidden
        className={
          featured
            ? "pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.72),transparent)]"
            : "pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(31,100,224,0.25),transparent)]"
        }
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <span
          className={
            featured
              ? "grid size-10 place-items-center rounded-2xl bg-white/16 text-white ring-1 ring-inset ring-white/18"
              : "grid size-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100"
          }
        >
          <Icon className="size-5" />
        </span>
      </div>

      <h3
        className={
          featured
            ? "text-pretty text-xl leading-8 font-extrabold text-white sm:text-2xl sm:leading-9"
            : "text-xl leading-7 font-extrabold text-pretty text-ink"
        }
      >
        {point.title}
      </h3>
      <p className={featured ? "mt-4 text-sm leading-7 text-white/76" : "mt-4 text-sm leading-7 text-muted"}>
        {point.body}
      </p>
    </article>
  );
}
