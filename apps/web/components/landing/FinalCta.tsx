import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

export function FinalCta() {
  return (
    <section className="px-3 pt-4 pb-10 sm:px-5">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(150deg,#5b76e8_0%,#3b5fd9_46%,#1f4ec4_100%)] px-6 py-16 text-white shadow-[0_36px_90px_rgba(31,78,196,0.35)] sm:px-12 sm:py-20 lg:px-16">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_22rem_at_18%_-10%,rgba(255,255,255,0.2),transparent_60%),radial-gradient(30rem_20rem_at_100%_110%,rgba(125,227,236,0.18),transparent_60%)]"
          />

          <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <h2 className="max-w-xl text-4xl font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
                More interviews. None of the busywork.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-pretty text-white/80 sm:text-lg">
                Create your account, set your preferences, and JobPosted starts sending tailored
                applications for you. Then log in once a day to see what went out.
              </p>
              <div className="mt-8 flex">
                <Link
                  href={{ pathname: "/get-started" }}
                  className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-bold text-brand-800 shadow-[0_14px_30px_rgba(7,26,51,0.25)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-sky-50 active:translate-y-0"
                >
                  Get started
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            <CtaIllustration />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** Abstract glass composition: a tailored application held inside orbit rings. */
function CtaIllustration() {
  return (
    <div aria-hidden className="relative mx-auto hidden h-80 w-full max-w-md lg:block">
      <span className="absolute top-1/2 left-1/2 size-72 -translate-1/2 rounded-full border-[10px] border-white/14" />
      <span className="absolute top-1/2 left-1/2 size-96 -translate-1/2 rotate-[24deg] rounded-full border-[14px] border-white/8" />
      <span className="soft-float-slow absolute top-[12%] right-[14%] size-4 rounded-full bg-sun" />
      <span className="soft-float absolute bottom-[14%] left-[10%] size-3 rounded-full bg-[#7fe3ec]" />

      <div className="panel-drift absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-3xl bg-white p-5 text-ink shadow-[0_34px_80px_rgba(4,16,42,0.4)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold">Application ready</p>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-700">
            96% fit
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 w-full rounded-full bg-brand-100" />
          <span className="block h-2 w-8/12 rounded-full bg-aqua/50" />
          <span className="block h-2 w-10/12 rounded-full bg-brand-200" />
        </div>
        <div className="mt-5 flex items-center justify-between rounded-full bg-ink px-4 py-2.5 text-white">
          <span className="text-xs font-extrabold">Sent for you</span>
          <span className="grid size-6 place-items-center rounded-full bg-white text-[11px] font-black text-brand-700">
            ✓
          </span>
        </div>
      </div>

      <div className="liquid-glass-dark soft-float absolute -right-2 bottom-6 w-44 rounded-2xl p-3.5">
        <p className="text-[10px] font-black tracking-[0.12em] text-white/70 uppercase">
          Today&apos;s batch
        </p>
        <p className="mt-1 text-sm font-extrabold text-white">16 applications sent</p>
      </div>
    </div>
  );
}
