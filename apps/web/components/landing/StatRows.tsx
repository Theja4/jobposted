"use client";

import { Reveal } from "@/components/ui/Reveal";
import { CountUp } from "@/components/ui/CountUp";

export function StatRows() {
  return (
    <section className="px-5 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-5xl">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-extrabold tracking-[0.2em] text-brand-700 uppercase">
            The honest numbers
          </p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl">
            Built for fewer, better applications.
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
          <Reveal amount={0.3}>
            <div className="grid items-center gap-6 py-10 sm:grid-cols-[7rem_1fr] lg:grid-cols-[7rem_1fr_minmax(0,20rem)] sm:py-12">
              <RadarTile />
              <div className="relative w-fit">
                <span className="absolute -top-3 -right-14 hidden rotate-[8deg] rounded-full bg-[linear-gradient(150deg,#ffd98a,#f8b84e)] px-3 py-1 text-xs font-black whitespace-nowrap text-[#3d2c05] shadow-[0_8px_20px_rgba(248,184,78,0.4)] sm:inline-block">
                  every night
                </span>
                <p className="text-7xl font-extrabold tracking-[-0.05em] text-ink sm:text-8xl lg:text-9xl">
                  +<CountUp to={12} duration={1.2} />k
                </p>
              </div>
              <p className="text-sm leading-6 text-pretty text-muted">
                Live roles ingested nightly from Greenhouse, Lever, and Ashby boards,
                deduped and matched against your profile before you wake up.
              </p>
            </div>
          </Reveal>

          <Reveal amount={0.3}>
            <div className="grid items-center gap-6 py-10 sm:grid-cols-[7rem_1fr] lg:grid-cols-[7rem_1fr_minmax(0,20rem)] sm:py-12">
              <FitTile />
              <div className="relative w-fit">
                <span className="absolute -top-3 -right-20 hidden rotate-[-6deg] rounded-full bg-[linear-gradient(150deg,#7fe3ec,#16c7d4)] px-3 py-1 text-xs font-black whitespace-nowrap text-[#063b40] shadow-[0_8px_20px_rgba(22,199,212,0.4)] sm:inline-block">
                  before queueing
                </span>
                <p className="text-7xl font-extrabold tracking-[-0.05em] text-ink sm:text-8xl lg:text-9xl">
                  <CountUp to={96} from={40} duration={1.4} />%
                </p>
              </div>
              <p className="text-sm leading-6 text-pretty text-muted">
                Average role fit of applications that reach your queue. Weak matches are
                dropped, not padded in to inflate your numbers.
              </p>
            </div>
          </Reveal>

          <Reveal amount={0.3}>
            <div className="grid items-center gap-6 py-10 sm:grid-cols-[7rem_1fr] lg:grid-cols-[7rem_1fr_minmax(0,20rem)] sm:py-12">
              <ConfirmTile />
              <div className="relative w-fit">
                <span className="absolute -top-3 -right-24 hidden rotate-[6deg] rounded-full bg-ink px-3 py-1 text-xs font-black whitespace-nowrap text-white shadow-[0_8px_20px_rgba(7,26,51,0.3)] sm:inline-block">
                  time wasted
                </span>
                <p className="text-7xl font-extrabold tracking-[-0.05em] text-brand-600 sm:text-8xl lg:text-9xl">
                  <CountUp to={0} from={5} duration={1.6} />
                </p>
              </div>
              <p className="text-sm leading-6 text-pretty text-muted">
                Forms you fill out by hand. JobPosted tailors each resume, completes the
                application, and submits it. You just acknowledge what went out, once a day.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function RadarTile() {
  return (
    <div className="relative size-24 overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#11408f,#1f64e0)] shadow-[0_18px_40px_rgba(31,100,224,0.3)] sm:size-28">
      <span className="absolute top-1/2 left-1/2 size-[5.5rem] -translate-1/2 rounded-full border border-white/25" />
      <span className="absolute top-1/2 left-1/2 size-14 -translate-1/2 rounded-full border border-white/35" />
      <span className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-white" />
      <span className="absolute top-[22%] left-[64%] size-2.5 rounded-full bg-[#7fe3ec]" />
      <span className="absolute top-[62%] left-[20%] size-2 rounded-full bg-sun" />
      <span className="absolute top-[70%] left-[70%] size-2 rounded-full bg-white/80" />
    </div>
  );
}

function FitTile() {
  return (
    <div className="relative flex size-24 flex-col justify-center gap-2 overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#27b3d8,#1b86dd)] p-4 shadow-[0_18px_40px_rgba(27,134,221,0.3)] sm:size-28">
      <span className="block h-2 w-10/12 rounded-full bg-white/85" />
      <span className="block h-2 w-7/12 rounded-full bg-white/55" />
      <span className="block h-2 w-9/12 rounded-full bg-white/70" />
      <span className="absolute -right-3 -bottom-3 grid size-12 place-items-center rounded-full bg-sun text-sm font-black text-[#3d2c05]">
        A+
      </span>
    </div>
  );
}

function ConfirmTile() {
  return (
    <div className="relative grid size-24 place-items-center overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#102f66,#071a33)] shadow-[0_18px_40px_rgba(7,26,51,0.35)] sm:size-28">
      <span className="grid size-12 place-items-center rounded-full bg-white text-xl font-black text-brand-700">
        ✓
      </span>
      <svg
        className="absolute right-3.5 bottom-3.5 size-5 rotate-[-10deg] drop-shadow"
        viewBox="0 0 24 24"
        fill="white"
        stroke="#071a33"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M4 2l16 9-7 1.5L9 20z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
