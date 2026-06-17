import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LayoutDashboard,
  Send,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { BILLING_PLANS, BILLING_TENURE_META, parsePlan, parseTenure } from "@/lib/billing/plans";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Upgrade complete",
  description: "Your JobPosted plan is active. Finish your profile setup to start using your workspace.",
};

type SuccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const plan = parsePlan(first(params.plan));
  const tenure = parseTenure(first(params.tenure));
  const planLabel = plan ? BILLING_PLANS[plan].label : "JobPosted";
  const tenureLabel = tenure ? BILLING_TENURE_META[tenure].label : null;

  const steps = [
    {
      label: "Plan active",
      detail: `${tenureLabel ? `${tenureLabel} ` : ""}${planLabel} workspace ready`,
      Icon: CheckCircle2,
      tone: "bg-mint text-white",
    },
    {
      label: "Profile setup",
      detail: "Add the details JobPosted should use",
      Icon: UserRoundCheck,
      tone: "bg-brand-600 text-white",
    },
    {
      label: "Applications for you",
      detail: "Review prepared roles from the queue",
      Icon: ClipboardCheck,
      tone: "bg-white text-brand-700",
    },
  ];

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-panel px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[linear-gradient(180deg,rgba(31,100,224,0.16),rgba(255,255,255,0))]"
      />
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <Link href="/" aria-label={`${SITE_NAME} home`} className="inline-flex items-center gap-2.5">
            <Image
              src="/brand/jobposted-mark.png"
              alt=""
              width={80}
              height={76}
              aria-hidden="true"
              className="size-12 object-contain"
              priority
            />
            <span className="text-xl font-extrabold">
              Job<span className="text-brand-700">Posted</span>
            </span>
          </Link>
          <span className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black text-brand-800">
            <CheckCircle2 className="size-4" />
            Payment complete
          </span>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_0.9fr] lg:py-14">
          <div className="max-w-2xl">
            <div className="glass-chip mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black text-brand-800">
              <Sparkles className="size-4" />
              {tenureLabel ? `${tenureLabel} ${planLabel}` : planLabel} is active
            </div>
            <h1 className="text-5xl font-extrabold text-ink sm:text-6xl lg:text-7xl">
              You're upgraded. Finish your profile setup.
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold leading-8 text-muted">
              Your JobPosted workspace is ready. Add your profile details so the dashboard can prepare better matches, resumes, and review-ready applications.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={"/dashboard/setup" as Route}
                className="animated-get-started group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-2xl px-7 text-base font-extrabold text-white transition duration-200 hover:-translate-y-0.5"
              >
                <span className="animated-get-started__sheen" aria-hidden />
                <span className="relative z-10 inline-flex items-center gap-2">
                  Go to profile setup
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-7 text-base font-extrabold text-ink shadow-[0_14px_30px_-24px_rgba(15,23,42,0.5),0_6px_14px_-12px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700"
              >
                <LayoutDashboard className="size-5" />
                Open dashboard
              </Link>
            </div>
          </div>

          <div className="relative min-h-[26rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(145deg,#102f66,#1f64e0_58%,#60a5fa)] p-5 text-white shadow-[0_34px_90px_-42px_rgba(31,100,224,0.78)] sm:p-6">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))]"
            />
            <div className="relative flex h-full min-h-[22rem] flex-col justify-between">
              <div className="flex items-center justify-between gap-4">
                <div className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black text-white">
                  <Send className="size-4" />
                  Ready for launch
                </div>
                <Image
                  src="/brand/jobposted-mark.png"
                  alt=""
                  width={160}
                  height={151}
                  aria-hidden="true"
                  className="soft-float h-20 w-24 object-contain drop-shadow-[0_18px_28px_rgba(3,12,32,0.22)]"
                />
              </div>

              <div className="space-y-4">
                <div className="liquid-glass-dark rounded-[1.5rem] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-white/62">Next step</p>
                      <p className="mt-1 text-2xl font-extrabold">Complete setup</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-brand-700">
                      2 min
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/22">
                    <div className="score-sweep h-full rounded-full bg-white" />
                  </div>
                </div>

                <div className="grid gap-3">
                  {steps.map(({ label, detail, Icon, tone }) => (
                    <div
                      key={label}
                      className="liquid-glass-dark flex items-center gap-3 rounded-2xl px-4 py-3"
                    >
                      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold">{label}</span>
                        <span className="block text-xs font-semibold text-white/66">{detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
