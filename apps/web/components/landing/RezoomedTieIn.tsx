import {
  BadgeCheck,
  Check,
  FileText,
  Gauge,
  Layers3,
  Sparkles,
  type LucideIcon,
  WandSparkles,
} from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

const TAILORING_SIGNALS = [
  "Role language",
  "ATS keywords",
  "Impact bullets",
  "Seniority fit",
];

const QUALITY_MARKERS = [
  {
    label: "Frontier-model rewrite",
    detail: "Resume language adapts to the exact role.",
  },
  {
    label: "ATS structure pass",
    detail: "Keywords and sections stay recruiter-readable.",
  },
  {
    label: "Review before submit",
    detail: "JobPosted never sends it without your confirmation.",
  },
];

export function RezoomedTieIn() {
  return (
    <Section className="bg-[linear-gradient(180deg,#ffffff_0%,#f2f9ff_100%)]" innerClassName="max-w-6xl">
      <Reveal>
        <div className="group relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(231,246,255,0.92)_48%,rgba(215,240,255,0.9)_100%)] p-5 shadow-[0_26px_90px_rgba(31,100,224,0.13)] ring-1 ring-inset ring-sky-200/75 transition duration-500 hover:-translate-y-1 hover:shadow-[0_34px_120px_rgba(31,100,224,0.18)] sm:p-7 lg:p-8">
          <div
            aria-hidden
            className="absolute -left-28 top-10 size-72 rounded-full bg-brand-300/[0.28] blur-3xl transition duration-700 group-hover:bg-brand-300/[0.38]"
          />
          <div
            aria-hidden
            className="absolute right-[-8rem] top-[-9rem] size-96 rounded-full bg-aqua/20 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute bottom-[-14rem] left-1/3 size-[30rem] rounded-full bg-mint/[0.13] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,transparent_8%,rgba(255,255,255,0.78)_18%,transparent_30%)] opacity-0 transition duration-700 group-hover:translate-x-10 group-hover:opacity-60"
          />

          <div className="relative z-10 grid gap-9 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div>
              <div className="inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-full bg-white/[0.78] px-3 py-2 text-sm font-bold text-ink shadow-[0_12px_35px_rgba(15,64,120,0.08)] ring-1 ring-inset ring-white/80 backdrop-blur-xl">
                <RezoomedLogo />
                <span className="grid size-6 place-items-center rounded-full bg-sky-100 text-[11px] font-black text-brand-700 ring-1 ring-inset ring-sky-200">
                  x
                </span>
                <Logo className="text-sm" />
              </div>

              <p className="mt-8 text-sm font-black uppercase tracking-[0.16em] text-brand-700">
                Powered by Rezoomed
              </p>
              <h2 className="mt-3 max-w-[12ch] text-4xl font-black tracking-[-0.035em] text-balance text-ink sm:text-5xl">
                Best-in-class tailoring, guaranteed.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-pretty text-slate-700">
                Rezoomed brings frontier-model resume tailoring. JobPosted turns that intelligence
                into a controlled application queue, so every resume is shaped for the role before
                you review it.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:max-w-xl">
                <ProofPill icon={Sparkles} label="Frontier models" />
                <ProofPill icon={Gauge} label="ATS fit pass" />
                <ProofPill icon={BadgeCheck} label="Human approval" />
              </div>
            </div>

            <div className="relative min-h-[30rem]">
              <div className="absolute left-4 top-5 hidden rounded-[1.5rem] bg-white/[0.62] p-4 shadow-[0_18px_46px_rgba(31,100,224,0.12)] ring-1 ring-inset ring-white/80 backdrop-blur-xl lg:block">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-mint/[0.16] text-mint">
                    <Check className="size-4.5" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Guarantee
                    </p>
                    <p className="text-sm font-black text-ink">No generic resume submitted</p>
                  </div>
                </div>
              </div>

              <div className="panel-drift relative ml-auto w-full max-w-[35rem] overflow-hidden rounded-[1.75rem] bg-white/[0.86] p-4 shadow-[0_28px_80px_rgba(20,63,145,0.16)] ring-1 ring-inset ring-sky-200/80 backdrop-blur-xl transition duration-500 group-hover:shadow-[0_36px_100px_rgba(20,63,145,0.2)] sm:p-5">
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-coral" />
                    <span className="size-2.5 rounded-full bg-sun" />
                    <span className="size-2.5 rounded-full bg-mint" />
                  </div>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100">
                    Rezoomed engine
                  </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_11rem]">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-[0_14px_34px_rgba(31,100,224,0.24)]">
                        <WandSparkles className="size-5.5" />
                      </span>
                      <div>
                        <p className="text-lg font-black text-ink">Tailored resume</p>
                        <p className="text-sm font-semibold text-slate-600">
                          Product designer / fintech
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 overflow-hidden rounded-[1.25rem] bg-slate-950 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200">
                          Quality score
                        </p>
                        <p className="text-sm font-black text-mint">97%</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="score-sweep h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#26c485_100%)]" />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {TAILORING_SIGNALS.map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full bg-white/[0.08] px-3 py-2 text-xs font-bold text-white/[0.78] ring-1 ring-inset ring-white/10"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <MetricTile label="ATS fit" value="A+" tone="blue" />
                    <MetricTile label="Rewrite" value="4.8x" tone="green" />
                    <MetricTile label="Ready" value="yes" tone="ink" />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {QUALITY_MARKERS.map((marker) => (
                    <div
                      key={marker.label}
                      className="rounded-[1.15rem] bg-sky-50/[0.78] p-3 ring-1 ring-inset ring-sky-100/90 transition duration-300 hover:-translate-y-1 hover:bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-full bg-white text-brand-700 shadow-sm">
                          <Layers3 className="size-3.5" />
                        </span>
                        <p className="text-sm font-black text-ink">{marker.label}</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{marker.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="soft-float absolute bottom-2 right-3 hidden w-52 rounded-[1.35rem] bg-white/80 p-3 shadow-[0_18px_50px_rgba(31,100,224,0.14)] ring-1 ring-inset ring-white/80 backdrop-blur-xl sm:block">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
                    <FileText className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-700">
                      Before fill
                    </p>
                    <p className="text-sm font-black text-ink">Resume is ready</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function RezoomedLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-xl bg-[conic-gradient(from_155deg,#1f64e0,#16c7d4,#26c485,#1f64e0)] shadow-[0_10px_24px_rgba(31,100,224,0.22)]">
        <span className="absolute inset-[3px] rounded-[0.55rem] bg-white/[0.92]" />
        <Sparkles className="relative size-3.5 text-brand-700" strokeWidth={2.8} />
      </span>
      <span className="font-black tracking-[-0.025em] text-ink">Rezoomed</span>
    </span>
  );
}

function ProofPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/[0.72] px-3 py-2 text-sm font-black text-slate-800 shadow-[0_10px_28px_rgba(15,64,120,0.07)] ring-1 ring-inset ring-sky-100 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:bg-white">
      <Icon className="size-4 text-brand-700" strokeWidth={2.6} />
      <span>{label}</span>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "ink";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-brand-600 text-white"
      : tone === "green"
        ? "bg-mint/[0.16] text-emerald-700"
        : "bg-ink text-white";

  return (
    <div className="rounded-[1.15rem] bg-white/[0.82] p-3 ring-1 ring-inset ring-sky-100 transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(31,100,224,0.12)]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-lg font-black ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
