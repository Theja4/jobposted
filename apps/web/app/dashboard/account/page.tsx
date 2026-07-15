import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { ManageBillingButton } from "@/components/dashboard/ManageBillingButton";
import { getBundledProEntitlement } from "@/lib/billing/entitlements";
import { REZOOMED_ACCOUNT_URL, REZOOMED_URL, SUPPORT_EMAIL } from "@/lib/site";
import { Mail, ShieldCheck, ExternalLink, ReceiptText } from "lucide-react";

export const metadata: Metadata = { title: "Account" };

function joinedOn(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const provider = user?.app_metadata?.provider ?? "email";
  const entitlement = user ? await getBundledProEntitlement(supabase, user.id) : null;
  const isPro = entitlement?.active ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Account</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          Your login and security. Looking for your resume data?{" "}
          <Link
            href={(isPro ? "/dashboard/onboarding" : "/dashboard/pricing") as Route}
            className="font-bold text-brand-700 hover:text-brand-800"
          >
            {isPro ? "Update it in Setup" : "Upgrade for Setup"}
          </Link>
          .
        </p>
      </div>

      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] text-lg font-black text-white">
            {(user?.email ?? "JP").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold text-ink">{user?.email ?? "Your account"}</p>
            <p className="text-sm font-semibold text-muted">Member since {joinedOn(user?.created_at)}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white">
            <Mail className="size-4 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">Email</dt>
              <dd className="truncate text-sm font-bold text-ink">{user?.email ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white">
            <ShieldCheck className="size-4 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">Sign-in method</dt>
              <dd className="truncate text-sm font-bold text-ink capitalize">{provider}</dd>
            </div>
          </div>
        </dl>
      </section>

      {!isPro ? (
        <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">JobPosted Pro</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Free accounts can use the job board and tracker. Upgrade to unlock Setup, Queue,
            resume tailoring, and application history.
          </p>
          <Link
            href={"/dashboard/pricing" as Route}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-[0_12px_22px_-16px_rgba(31,100,224,0.58)] transition-colors hover:bg-brand-700"
          >
            View pricing <ExternalLink className="size-3.5" />
          </Link>
        </section>
      ) : null}

      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Connected to Rezoomed</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Your tailored resumes and match scores are powered by Rezoomed. Manage your resume
          library and templates there.
        </p>
        <a
          href={REZOOMED_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors hover:bg-brand-50"
        >
          Open Rezoomed <ExternalLink className="size-3.5" />
        </a>
      </section>

      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Billing and support</h2>
        {entitlement?.source === "rezoomed" ? (
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Your Pro access is included through Rezoomed. Manage that subscription from your
            Rezoomed account. JobPosted billing controls only apply to JobPosted purchases.
          </p>
        ) : (
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Manage invoices, payment method, and cancellation from your JobPosted billing portal.
            For refund or account questions, contact JobPosted support.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {entitlement?.source === "rezoomed" ? (
            <a
              href={REZOOMED_ACCOUNT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-[0_12px_26px_rgba(31,100,224,0.22)] transition-colors hover:bg-brand-700"
            >
              Open Rezoomed billing <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <ManageBillingButton supportEmail={SUPPORT_EMAIL} />
          )}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors hover:bg-brand-50"
          >
            <Mail className="size-3.5" />
            {SUPPORT_EMAIL}
          </a>
          <a
            href="/refund"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-white"
          >
            <ReceiptText className="size-3.5" />
            Refund policy
          </a>
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white/70 p-6 ring-1 ring-inset ring-white sm:p-7">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Session</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Sign out of JobPosted on this device.
        </p>
        <SignOutButton className="mt-4 rounded-full bg-coral/10 px-4 py-2 ring-1 ring-inset ring-coral/20 hover:bg-coral/15" />
      </section>
    </div>
  );
}
