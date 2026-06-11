import { Ban, Laptop, LockKeyhole, type LucideIcon, MousePointerClick } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

const PILLARS = [
  {
    icon: Ban,
    title: "We don't spray",
    body: "No blasting 500 generic applications. Every application is tailored and matched to the role — quality over vanity volume.",
  },
  {
    icon: MousePointerClick,
    title: "You confirm every submission",
    body: "Nothing goes out until you approve it. You see the tailored resume and a screenshot of the filled form, then press confirm.",
  },
  {
    icon: Laptop,
    title: "Your LinkedIn never runs from our servers",
    body: "Logged-in platforms only run in your own browser session via the extension — never from a datacenter IP that gets you flagged.",
  },
];

export function Trust() {
  return (
    <section id="trust" className="bg-navy px-5 py-20 text-white sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <Reveal>
          <p className="text-sm font-bold text-brand-200">Control layer</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
            Built so automation never outruns your judgment.
          </h2>
          <p className="mt-4 text-lg text-pretty text-white/70">
            Auto-apply tools have a reputation for spraying garbage and getting accounts
            restricted. We designed JobPosted to be the opposite — and it&apos;s the one thing
            every competitor leaves out.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <ControlRow icon={MousePointerClick} label="You confirm every final submission" />
            <ControlRow icon={LockKeyhole} label="No LinkedIn or Workday password storage" />
            <ControlRow icon={Laptop} label="Logged-in platforms run in your browser" />
            <ControlRow icon={Ban} label="No generic batch blasting" />
          </div>
        </Reveal>

        <div className="grid gap-4">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.07}>
              <div className="group rounded-2xl bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10 transition duration-200 hover:-translate-y-1 hover:bg-white/[0.09]">
                <div className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/20 text-brand-200 transition-transform duration-200 group-hover:scale-105">
                    <p.icon className="size-5.5" strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{p.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-pretty text-white/65">{p.body}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ControlRow({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm font-bold text-white/85 ring-1 ring-inset ring-white/10 transition duration-200 hover:bg-white/[0.1]">
      <Icon className="size-4 shrink-0 text-brand-200" strokeWidth={2.3} />
      <span>{label}</span>
    </div>
  );
}
