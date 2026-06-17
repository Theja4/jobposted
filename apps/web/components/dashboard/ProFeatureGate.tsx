import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";

type ProFeatureGateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
};

export function ProFeatureGate({ icon: Icon, title, description, detail }: ProFeatureGateProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100svh-9rem)] max-w-3xl items-center">
      <div className="w-full rounded-[1.5rem] bg-white/90 p-6 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.52),0_8px_20px_-18px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 shadow-[0_10px_18px_-14px_rgba(31,100,224,0.48)]">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted sm:text-base">
              {description}
            </p>
            {detail ? (
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{detail}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white shadow-[0_14px_28px_-20px_rgba(31,100,224,0.65)] transition-colors hover:bg-brand-700"
          >
            Upgrade to unlock <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/dashboard/jobs"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-ink shadow-[0_12px_24px_-20px_rgba(15,23,42,0.42)] transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            Browse jobs <BriefcaseBusiness className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
