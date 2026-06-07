import { Ban, MousePointerClick, Laptop } from "lucide-react";
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
    <section className="bg-ink px-5 py-20 text-white sm:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-brand-300 uppercase">
            Why you won&apos;t get banned
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built so a bot never gets you in trouble.
          </h2>
          <p className="mt-4 text-lg text-pretty text-white/70">
            Auto-apply tools have a reputation for spraying garbage and getting accounts
            restricted. We designed JobPosted to be the opposite — and it&apos;s the one thing
            every competitor leaves out.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.07}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                  <p.icon className="size-5.5" strokeWidth={2} />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-pretty text-white/65">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
