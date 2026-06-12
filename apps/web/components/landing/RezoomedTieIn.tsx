import Image from "next/image";
import { ArrowUpRight, Check, Trophy } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Partnership panel — real Rezoomed brand assets (app icon + mascot from
 * rezoomed.com, stored in /public/rezoomed), short copy, no dashboard mock.
 */
export function RezoomedTieIn() {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14">
      <Reveal className="mx-auto w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(150deg,#f4faff_0%,#e3f1ff_55%,#d7ebff_100%)] ring-1 ring-sky-100 ring-inset">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(32rem_20rem_at_82%_82%,rgba(38,196,133,0.14),transparent_60%),radial-gradient(36rem_22rem_at_8%_-10%,rgba(255,255,255,0.85),transparent_60%)]"
          />

          <div className="relative z-10 grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)] lg:gap-10 lg:px-12 xl:px-14">
            <div className="max-w-xl">
              <div className="glass-chip inline-flex items-center gap-2.5 rounded-full py-2 pr-4 pl-2 text-sm font-bold text-ink">
                <Image
                  src="/rezoomed/logo.png"
                  alt="Rezoomed app icon"
                  width={28}
                  height={28}
                  className="rounded-lg"
                />
                <span>Rezoomed</span>
                <span className="text-muted">×</span>
                <Logo className="text-sm" />
              </div>

              <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-left text-xs leading-5 font-black text-brand-800 ring-1 ring-inset ring-white/90 sm:rounded-full sm:text-sm">
                <Trophy className="size-4 shrink-0 text-sun" />
                <span>Powered by Rezoomed&apos;s #1 resume tailoring AI</span>
              </div>

              <h2 className="mt-4 max-w-xl text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl">
                Every application starts with the best fit resume.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-pretty text-muted sm:text-lg">
                Rezoomed rewrites your bullets, keywords, and ATS structure before JobPosted fills
                the form, never a generic template.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <a
                  href="https://rezoomed.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-white shadow-[0_14px_30px_rgba(7,26,51,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  Meet Rezoomed
                  <ArrowUpRight className="size-4" />
                </a>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-muted">
                  <span className="grid size-5 place-items-center rounded-full bg-mint text-white">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                  ATS ready on every send
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm lg:mr-0">
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 -z-0 size-72 -translate-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9)_0%,rgba(38,196,133,0.12)_55%,transparent_72%)] sm:size-96"
              />
              <Image
                src="/rezoomed/mascot-papers-blue.png"
                alt="Rezoomed mascot holding two tailored resumes"
                width={561}
                height={701}
                className="panel-drift relative z-10 mx-auto w-64 drop-shadow-[0_30px_40px_rgba(16,47,102,0.18)] sm:w-[19rem] lg:w-80"
              />
              <div className="glass-chip absolute right-0 bottom-10 z-20 rotate-[4deg] rounded-2xl px-4 py-3 sm:right-2">
                <p className="text-[10px] font-black tracking-[0.12em] text-muted uppercase">
                  Tailoring pass
                </p>
                <p className="text-sm font-extrabold text-ink">Rewritten · ATS ready</p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
