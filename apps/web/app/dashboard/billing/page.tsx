import { Check, CheckCircle2 } from "lucide-react";
import { PLANS, type Plan } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/billing/entitlement";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ManageBillingButton } from "@/components/billing/ManageBillingButton";
import { cn } from "@/lib/cn";

export const metadata = { title: "Billing" };

const FEATURES: Record<Plan, string[]> = {
  starter_20: [
    "Up to 20 applications a day*",
    "A resume tailored to every role",
    "Server-side apply on open ATS",
    "Review queue — you confirm every submission",
  ],
  pro_50: [
    "Up to 50 applications a day*",
    "Everything in Starter",
    "Autopilot for high-match open-ATS roles",
    "Chrome extension for LinkedIn & Workday",
  ],
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const e = await getEntitlement(user!.id);
  const isActive = e.status === "active";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Billing</h1>
        <p className="mt-1 text-sm text-muted">
          Paid, not freemium — your first {e.trialLimit} applications are free.
        </p>
      </header>

      {status === "success" && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
          <CheckCircle2 className="size-5 text-brand-600" /> You&apos;re subscribed — thanks! Your plan
          is active.
        </div>
      )}

      {/* Current status */}
      <div className="mb-8 rounded-2xl border border-zinc-100 bg-white p-5">
        {isActive ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {e.plan ? PLANS[e.plan].name : "Active"} plan
              </p>
              <p className="text-sm text-muted">
                Today: {e.submittedToday} of {e.dailyLimit} applications applied.
              </p>
            </div>
            <ManageBillingButton />
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-ink">
              Free trial — {Math.max(0, e.trialLimit - e.trialUsed)} of {e.trialLimit} left
            </p>
            <p className="mt-1 text-sm text-muted">
              {e.trialUsed >= e.trialLimit
                ? "You've used your free applications. Pick a plan to keep applying."
                : "Upgrade any time to apply at higher daily volume."}
            </p>
          </div>
        )}
      </div>

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-2">
        {(["starter_20", "pro_50"] as Plan[]).map((plan) => {
          const info = PLANS[plan];
          const current = isActive && e.plan === plan;
          return (
            <div
              key={plan}
              className={cn(
                "flex flex-col rounded-2xl border p-7",
                plan === "pro_50" ? "border-brand-200 ring-1 ring-brand-200" : "border-zinc-200",
              )}
            >
              <h3 className="text-lg font-semibold text-ink">{info.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-ink">${info.priceUsd}</span>
                <span className="text-sm text-muted">/mo</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {FEATURES[plan].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-ink/85">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                {current ? (
                  <span className="flex h-13 w-full items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
                    Current plan
                  </span>
                ) : (
                  <UpgradeButton
                    plan={plan}
                    label={`Choose ${info.name}`}
                    variant={plan === "pro_50" ? "primary" : "secondary"}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted">
        *&ldquo;Up to&rdquo; is an upper bound, gated by how many relevant roles are in your pool that
        day. Cancel anytime.
      </p>
    </div>
  );
}
