import { ArrowRight, FileText, MousePointerClick, Search } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    number: "01",
    caption: "Find roles actually worth your next click",
    label: "Matched roles",
    icon: Search,
    gradient: "from-[#1d7fe8] via-[#1f64e0] to-[#143f91]",
    chip: { text: "96% fit", className: "bg-white text-brand-700" },
    offset: "lg:mt-20",
  },
  {
    number: "02",
    caption: "Tailor, fill, and queue every application",
    label: "Resume tailoring",
    icon: FileText,
    gradient: "from-[#27b3d8] via-[#1b86dd] to-[#1f64e0]",
    chip: { text: "ATS ready", className: "bg-sun text-[#3d2c05]" },
    offset: "lg:mt-0",
  },
  {
    number: "03",
    caption: "Review the final state and confirm the send",
    label: "Your confirmation",
    icon: MousePointerClick,
    gradient: "from-[#143f91] via-[#102f66] to-[#071a33]",
    chip: { text: "you press send", className: "bg-white/90 text-brand-800" },
    offset: "lg:mt-32",
  },
] as const;

export function Steps() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-5 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-extrabold tracking-[0.2em] text-brand-700 uppercase">
            How it works
          </p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            Three calm steps from match to sent.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.08} className={step.offset}>
              <article className="group">
                <p className="max-w-[16rem] text-base leading-6 font-semibold text-ink/80">
                  {step.caption}
                </p>
                <div
                  className={cn(
                    "relative mt-4 flex min-h-[16rem] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white",
                    "shadow-[0_24px_60px_rgba(16,47,102,0.18)] transition duration-300 ease-out group-hover:-translate-y-2 group-hover:shadow-[0_34px_80px_rgba(16,47,102,0.26)]",
                    step.gradient,
                  )}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)]"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-14 -right-14 size-44 rounded-full bg-white/12 blur-2xl transition duration-500 group-hover:scale-125"
                  />

                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-bold text-white/85">{step.label}</p>
                    <span
                      className={cn(
                        "rotate-[6deg] rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap transition duration-300 group-hover:rotate-0",
                        step.chip.className,
                      )}
                    >
                      {step.chip.text}
                    </span>
                  </div>

                  <span className="liquid-glass-dark mt-5 grid size-12 place-items-center rounded-2xl">
                    <step.icon className="size-5.5" />
                  </span>

                  <div className="mt-auto flex items-end justify-between pt-8">
                    <span className="text-7xl leading-none font-extrabold tracking-[-0.05em] sm:text-8xl">
                      {step.number}
                    </span>
                    <span className="grid size-11 place-items-center rounded-full bg-white/16 ring-1 ring-white/25 ring-inset transition duration-300 group-hover:bg-white group-hover:text-brand-700">
                      <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
