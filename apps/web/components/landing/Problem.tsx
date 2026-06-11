import { ArrowRight, Search } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const CARDS = [
  {
    eyebrow: "Match scout",
    title: "Find roles worth your next click",
    subline: "Role fit 96%",
    action: "See matches",
    bg: "from-[#33106d] via-[#1f64e0] to-[#65d8ff]",
    glow: "bg-aqua",
    Object: MatchObject,
  },
  {
    eyebrow: "Resume tailor",
    title: "Make every resume feel made for the role",
    subline: "ATS tuned",
    action: "View resume",
    bg: "from-[#071a33] via-[#2842d8] to-[#ff8a66]",
    glow: "bg-coral",
    Object: ResumeObject,
  },
  {
    eyebrow: "Review stop",
    title: "Approve the final send yourself",
    subline: "You confirm",
    action: "Review queue",
    bg: "from-[#102f66] via-[#7037e6] to-[#26c485]",
    glow: "bg-mint",
    Object: ConfirmObject,
  },
];

export function Problem() {
  return (
    <section className="relative overflow-hidden px-5 py-20 sm:py-24">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(22,199,212,0.18),transparent_28%),radial-gradient(circle_at_84%_8%,rgba(248,184,78,0.22),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f4f9ff_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.28] [background-image:radial-gradient(rgba(31,100,224,0.17)_1px,transparent_1px)] [background-size:12px_12px]"
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-extrabold tracking-[0.22em] text-coral">
            APPLICATION COPILOT
          </p>
          <h2 className="mt-6 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            AI that prepares better applications without taking over.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {CARDS.map((card, index) => (
            <Reveal key={card.title} delay={index * 0.08}>
              <ScreenCard {...card} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScreenCard({
  eyebrow,
  title,
  subline,
  action,
  bg,
  glow,
  Object,
}: {
  eyebrow: string;
  title: string;
  subline: string;
  action: string;
  bg: string;
  glow: string;
  Object: () => React.ReactNode;
}) {
  return (
    <article className="group h-full rounded-2xl bg-white p-2 ring-1 ring-inset ring-brand-100 transition duration-300 hover:-translate-y-2 hover:ring-brand-200">
      <div
        className={cn(
          "relative flex min-h-[34rem] overflow-hidden rounded-xl bg-gradient-to-b p-5 text-white md:min-h-[37rem]",
          bg,
        )}
      >
        <div className={cn("absolute left-1/2 top-44 size-48 -translate-x-1/2 rounded-full opacity-30 blur-3xl", glow)} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.12),transparent_38%,rgba(0,0,0,0.34)_100%)]" />

        <div className="relative z-10 flex min-h-full w-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/62">
                {eyebrow}
              </p>
              <h3 className="mt-3 max-w-[15rem] text-4xl font-extrabold leading-[0.95] tracking-[-0.045em] text-white sm:text-[2.7rem]">
                {title}
              </h3>
            </div>
            <div className="relative mt-8 hidden shrink-0 sm:block">
              <span className="absolute -right-3 -top-7 rotate-12 text-[11px] font-bold italic text-white/75">
                quick apply
              </span>
              <span className="grid size-16 place-items-center rounded-full bg-white/18 text-white ring-1 ring-white/18 transition duration-300 group-hover:scale-110 group-hover:bg-white/24">
                <ArrowRight className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
          </div>

          <div className="relative mt-auto pt-8">
            <Object />
            <div className="relative z-20 mt-4 rounded-[1.4rem] bg-white px-5 py-3 text-center text-sm font-extrabold text-ink transition duration-300 group-hover:-translate-y-1">
              {action}
              <span className="ml-2 text-muted">{subline}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function MatchObject() {
  return (
    <div className="relative z-10 mx-auto h-44 w-60 transition duration-300 group-hover:-translate-y-3 group-hover:rotate-[-2deg]">
      <div className="absolute inset-x-6 bottom-1 h-8 rounded-full bg-black/28 blur-xl" />
      <div className="absolute left-2 top-10 h-24 w-44 rotate-[-9deg] rounded-2xl bg-white p-4 text-ink ring-1 ring-white/40">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-brand-700">Product Engineer</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-black text-brand-700">
            96%
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 w-10/12 rounded-full bg-brand-200" />
          <span className="block h-2 w-7/12 rounded-full bg-aqua/70" />
          <span className="block h-2 w-9/12 rounded-full bg-sun/75" />
        </div>
      </div>
      <div className="absolute right-0 top-0 grid size-24 rotate-12 place-items-center rounded-[1.8rem] bg-aqua text-white">
        <Search className="size-10" strokeWidth={2.5} />
      </div>
    </div>
  );
}

function ResumeObject() {
  return (
    <div className="relative z-10 mx-auto h-44 w-60 transition duration-300 group-hover:-translate-y-3 group-hover:rotate-2">
      <div className="absolute inset-x-8 bottom-1 h-8 rounded-full bg-black/30 blur-xl" />
      <div className="absolute left-8 top-2 h-36 w-32 rotate-[-8deg] rounded-2xl bg-white p-4 text-ink ring-1 ring-white/40">
        <span className="block h-3 w-20 rounded-full bg-brand-600" />
        <div className="mt-5 space-y-2">
          <span className="block h-2 w-full rounded-full bg-brand-100" />
          <span className="block h-2 w-9/12 rounded-full bg-aqua/70" />
          <span className="block h-2 w-11/12 rounded-full bg-sun/75" />
          <span className="block h-2 w-7/12 rounded-full bg-brand-200" />
        </div>
      </div>
      <div className="absolute right-4 top-8 h-28 w-32 rotate-6 rounded-[1.6rem] bg-coral p-4 text-white">
        <span className="text-xs font-black">ATS</span>
        <div className="mt-5 text-4xl font-black tracking-[-0.08em]">94</div>
        <span className="text-xs font-bold text-white/70">score</span>
      </div>
    </div>
  );
}

function ConfirmObject() {
  return (
    <div className="relative z-10 mx-auto h-44 w-60 transition duration-300 group-hover:-translate-y-3 group-hover:rotate-[-1deg]">
      <div className="absolute inset-x-8 bottom-1 h-8 rounded-full bg-black/30 blur-xl" />
      <div className="absolute left-4 top-6 h-32 w-44 rotate-[-5deg] rounded-[1.8rem] bg-white p-4 text-ink ring-1 ring-white/40">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-mint text-white">✓</span>
          <div>
            <p className="text-sm font-black">Ready to send</p>
            <p className="text-xs font-semibold text-muted">You confirm</p>
          </div>
        </div>
        <div className="mt-5 rounded-full bg-brand-50 px-3 py-2 text-center text-xs font-black text-brand-700">
          Nothing leaves yet
        </div>
      </div>
      <div className="absolute right-2 top-0 grid size-20 rotate-12 place-items-center rounded-full bg-mint text-3xl font-black text-white">
        ✓
      </div>
    </div>
  );
}
