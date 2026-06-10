import { Check } from "lucide-react";
import { PLANS, TRIAL_APPLICATION_LIMIT } from "@jobposted/shared";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { CTAButton } from "@/components/ui/CTAButton";
import { cn } from "@/lib/cn";

const STARTER_FEATURES = [
  `Up to ${PLANS.starter_20.dailyLimit} applications a day*`,
  "A resume tailored to every role by Rezoomed",
  "Server-side apply on open ATS (Greenhouse, Lever, Ashby)",
  "Review queue — you confirm every submission",
  "Applications tracker + resume vault",
];

const PRO_FEATURES = [
  `Up to ${PLANS.pro_50.dailyLimit} applications a day*`,
  "Everything in Starter",
  "Autopilot for high-match open-ATS roles",
  "Chrome extension for LinkedIn & Workday (your own session)",
  "Resume performance analytics",
];

export function Pricing() {
  return (
    <Section id="pricing" innerClassName="max-w-5xl">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Pricing</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">
          Paid, not freemium — but you try it first.
        </h2>
        <p className="mt-4 text-pretty text-muted">
          Apply to your first <strong className="text-ink">{TRIAL_APPLICATION_LIMIT} jobs free</strong>.
          See the tailored resumes and filled forms before your card is ever charged.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <PlanCard
          name={PLANS.starter_20.name}
          price={PLANS.starter_20.priceUsd}
          tagline="For a focused, steady search."
          features={STARTER_FEATURES}
        />
        <PlanCard
          name={PLANS.pro_50.name}
          price={PLANS.pro_50.priceUsd}
          tagline="For going wide, fast — across every channel."
          features={PRO_FEATURES}
          featured
        />
      </div>

      <Reveal>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
          <span className="font-semibold text-ink">*“Up to” is honest.</span> Your daily cap is
          an upper bound, gated by how many relevant roles are in your pool that day. We show you
          a live count and never silently under-deliver.
        </p>
      </Reveal>
    </Section>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  features,
  featured = false,
}: {
  name: string;
  price: number;
  tagline: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <Reveal delay={featured ? 0.07 : 0}>
      <div
        className={cn(
          "relative flex h-full flex-col rounded-2xl border p-7",
          featured
            ? "border-brand-200 bg-white shadow-xl shadow-brand-900/10 ring-1 ring-brand-200"
            : "border-zinc-200 bg-white",
        )}
      >
        {featured && (
          <span className="absolute -top-3 right-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
            Most popular
          </span>
        )}
        <h3 className="text-lg font-semibold text-ink">{name}</h3>
        <p className="mt-1 text-sm text-muted">{tagline}</p>
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-4xl font-extrabold tracking-tight text-ink">${price}</span>
          <span className="text-sm text-muted">/mo</span>
        </div>

        <ul className="mt-6 flex-1 space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-ink/85">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={2.5} />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <CTAButton
          href="/login?next=%2Fdashboard%2Fbilling"
          variant={featured ? "primary" : "secondary"}
          size="lg"
          className="mt-7 w-full"
          event="pricing_cta_click"
          eventProps={{ plan: name }}
        >
          Start with {TRIAL_APPLICATION_LIMIT} free applications
        </CTAButton>
      </div>
    </Reveal>
  );
}
