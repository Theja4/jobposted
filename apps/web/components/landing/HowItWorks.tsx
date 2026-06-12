import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  ListChecks,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const WORKFLOW_PILLS = ["Match", "Tailor", "Review", "Confirm"];

const QUEUE_ITEMS = [
  { role: "Product Manager", company: "Stripe", score: "96%", tone: "bg-brand-600" },
  { role: "Growth Analyst", company: "Ramp", score: "91%", tone: "bg-aqua" },
  { role: "Customer Ops Lead", company: "Linear", score: "88%", tone: "bg-mint" },
];

const SIDEBAR_ITEMS = [
  { icon: ListChecks, label: "Queue", active: true },
  { icon: FileText, label: "Resumes" },
  { icon: ShieldCheck, label: "Review" },
  { icon: Send, label: "Submitted" },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f5fbff_48%,#eef9ff_100%)] px-5 py-20 sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_12%,rgba(22,199,212,0.16),transparent_28%),radial-gradient(circle_at_86%_78%,rgba(38,196,133,0.18),transparent_28%),radial-gradient(circle_at_72%_18%,rgba(31,100,224,0.13),transparent_30%)]"
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex w-fit gap-2 rounded-full bg-white/70 p-1 text-sm font-bold text-muted ring-1 ring-inset ring-white/80 backdrop-blur-xl">
            {WORKFLOW_PILLS.map((pill, index) => (
              <span
                key={pill}
                className={cn(
                  "rounded-full px-4 py-2",
                  index === 0 ? "bg-ink text-white shadow-[0_8px_18px_rgba(7,26,51,0.14)]" : "text-muted",
                )}
              >
                {pill}
              </span>
            ))}
          </div>
          <p className="mt-7 text-sm font-bold text-brand-700">How the queue works</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.032em] text-balance text-ink sm:text-6xl">
            A calm queue for the messy application work.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg">
            JobPosted finds relevant roles, prepares each application with a tailored resume, and
            parks everything for your final review.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-14 grid gap-5 lg:grid-cols-[13rem_1fr] lg:items-stretch">
            <QueueRail />
            <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
              <MatchedRolesPanel />
              <div className="grid gap-5">
                <SearchPanel />
                <TailoringPanel />
              </div>
              <ReviewPanel />
              <ConfirmPanel />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function QueueRail() {
  return (
    <aside className="rounded-2xl bg-white/62 p-5 ring-1 ring-inset ring-white/80 backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[radial-gradient(circle_at_30%_25%,#ffffff,transparent_28%),linear-gradient(135deg,#1f64e0,#16c7d4_55%,#26c485)] text-white">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="text-lg font-extrabold text-ink">Queue</p>
          <p className="text-xs font-bold text-muted">Today</p>
        </div>
      </div>

      <nav className="mt-7 space-y-2">
        {SIDEBAR_ITEMS.map((item) => (
          <a
            key={item.label}
            href={item.active ? "#pricing" : "#how-it-works"}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition duration-200 hover:-translate-y-0.5",
              item.active
                ? "bg-white text-ink shadow-[0_12px_30px_rgba(31,100,224,0.1)]"
                : "text-muted hover:bg-white/72 hover:text-ink",
            )}
          >
            <item.icon className={cn("size-4", item.active ? "text-brand-700" : "text-muted")} />
            {item.label}
          </a>
        ))}
      </nav>

      <div className="mt-8 rounded-2xl bg-[#dffbea]/80 p-4 text-sm ring-1 ring-inset ring-mint/20">
        <p className="font-extrabold text-ink">Control stays visible</p>
        <p className="mt-2 leading-6 text-ink/68">Nothing leaves the queue until you confirm it.</p>
      </div>
    </aside>
  );
}

function MatchedRolesPanel() {
  return (
    <article className="group relative min-h-[24rem] overflow-hidden rounded-2xl bg-white/62 p-5 ring-1 ring-inset ring-white/80 backdrop-blur-2xl transition duration-300 hover:-translate-y-2">
      <div
        aria-hidden
        className="absolute inset-x-4 top-4 h-28 rounded-2xl bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.72),transparent_28%),linear-gradient(135deg,#dff8ff_0%,#9bdfff_35%,#64d9bc_68%,#e4f8ff_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-4 top-4 h-28 rounded-2xl bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.42),transparent)] opacity-0 transition duration-500 group-hover:opacity-100"
      />

      <div className="relative z-10 pt-36">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-brand-700">Matched roles</p>
            <h3 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-ink">
              Best fit jobs first
            </h3>
          </div>
          <span className="grid size-10 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-inset ring-brand-100">
            <ArrowUpRight className="size-4" />
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {QUEUE_ITEMS.map((item) => (
            <div
              key={item.role}
              className="flex items-center gap-3 rounded-2xl bg-white/82 p-3 ring-1 ring-inset ring-white/90"
            >
              <span className={cn("grid size-10 place-items-center rounded-xl text-white", item.tone)}>
                <Search className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{item.role}</p>
                <p className="text-xs font-bold text-muted">{item.company}</p>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-extrabold text-brand-700">
                {item.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function SearchPanel() {
  return (
    <article className="rounded-2xl bg-white/62 p-5 ring-1 ring-inset ring-white/80 backdrop-blur-2xl">
      <div className="flex items-center gap-3 rounded-full bg-white/82 px-4 py-3 ring-1 ring-inset ring-white">
        <Search className="size-4 text-muted" />
        <span className="text-sm font-bold text-muted">Search &quot;remote product roles&quot;</span>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/72 p-3 ring-1 ring-inset ring-white/90">
        <span className="grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#eff6ff,#bff0ff,#dffbea)] text-brand-700">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-ink">Resume tailored before fill</p>
          <p className="text-xs font-bold text-muted">Rezoomed engine / ATS fit</p>
        </div>
        <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-white">
          <Check className="size-4" />
        </span>
      </div>
    </article>
  );
}

function TailoringPanel() {
  return (
    <article className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#dff8ff,#eff6ff_45%,#dffbea_100%)] p-5 ring-1 ring-inset ring-white/80">
      <div
        aria-hidden
        className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-mint/30 blur-2xl"
      />
      <p className="text-sm font-bold text-sky-800">Tailoring pass</p>
      <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-ink">Resume, not template</h3>
      <div className="mt-5 space-y-3">
        <Progress label="Role keywords" value="w-[94%]" />
        <Progress label="Resume fit" value="w-[88%]" />
        <Progress label="Form ready" value="w-[76%]" />
      </div>
    </article>
  );
}

function Progress({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-ink/70">
        <span>{label}</span>
        <CheckCircle2 className="size-4 text-mint" />
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/80">
        <div className={cn("h-full rounded-full bg-[linear-gradient(90deg,#1f64e0,#16c7d4,#26c485)]", value)} />
      </div>
    </div>
  );
}

function ReviewPanel() {
  return (
    <article className="rounded-2xl bg-white/62 p-5 ring-1 ring-inset ring-white/80 backdrop-blur-2xl md:min-h-[16rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-brand-700">Review snapshot</p>
          <h3 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-ink">You see the final state</h3>
        </div>
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <UserRound className="size-5" />
        </span>
      </div>

      <div className="mt-5 rounded-2xl bg-white/82 p-4 ring-1 ring-inset ring-white">
        <p className="text-sm leading-6 text-ink/75">
          &quot;This application is ready with a tailored resume and filled form. Confirm when it looks right.&quot;
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Tailored resume", "Filled form", "Apply path"].map((item) => (
            <span key={item} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-700">
              {item}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function ConfirmPanel() {
  return (
    <article className="relative overflow-hidden rounded-2xl bg-[#dffbea] p-5 ring-1 ring-inset ring-mint/25 md:min-h-[16rem]">
      <div
        aria-hidden
        className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-mint/30 blur-3xl"
      />
      <p className="text-sm font-bold text-emerald-800">Final action</p>
      <h3 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-ink">Confirm, then submit</h3>
      <p className="mt-3 max-w-sm text-sm leading-6 text-ink/68">
        The queue can prepare the work, but it never pretends your consent is optional.
      </p>
      <button
        type="button"
        className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-mint px-5 text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(38,196,133,0.22)] transition duration-200 hover:-translate-y-1 hover:bg-emerald-600"
      >
        Confirm ready
        <Send className="size-4" />
      </button>
    </article>
  );
}
