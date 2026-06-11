import Image from "next/image";
import { ArrowUpRight, Check } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Partnership panel — real Rezoomed brand assets (app icon + mascot from
 * rezoomed.com, stored in /public/rezoomed), short copy, no dashboard mock.
 */
export function RezoomedTieIn() {
  return (
    <section className="px-3 py-10 sm:px-5 sm:py-14">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(150deg,#f4faff_0%,#e3f1ff_55%,#d7ebff_100%)] ring-1 ring-sky-100 ring-inset">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(32rem_20rem_at_82%_82%,rgba(38,196,133,0.14),transparent_60%),radial-gradient(36rem_22rem_at_8%_-10%,rgba(255,255,255,0.85),transparent_60%)]"
          />

          <div className="relative z-10 grid items-center gap-10 px-6 py-14 sm:px-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-16">
            <div>
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

              <h2 className="mt-7 max-w-md text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl">
                Every resume rewritten for the role.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-pretty text-muted sm:text-lg">
                Rezoomed&apos;s tailoring engine reshapes your resume before each
                application is filled — never a generic template.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
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
                  ATS-ready before you review
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 -z-0 size-72 -translate-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9)_0%,rgba(38,196,133,0.12)_55%,transparent_72%)] sm:size-96"
              />
              <Image
                src="/rezoomed/mascot-papers-blue.png"
                alt="Rezoomed mascot holding two tailored resumes"
                width={561}
                height={701}
                className="panel-drift relative z-10 mx-auto w-64 drop-shadow-[0_30px_40px_rgba(16,47,102,0.18)] sm:w-80"
              />
              <div className="glass-chip absolute right-0 bottom-10 z-20 rotate-[4deg] rounded-2xl px-4 py-3 sm:right-2">
                <p className="text-[10px] font-black tracking-[0.12em] text-muted uppercase">
                  Tailoring pass
                </p>
                <p className="text-sm font-extrabold text-ink">Rewritten · ATS-ready</p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
