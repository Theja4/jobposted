import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Crown,
  ExternalLink,
  FileCheck2,
  Search,
  Sparkles,
  UserRoundCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ChromeLogo } from "@/components/icons/ChromeLogo";
import { CompanyAvatar } from "@/components/dashboard/CompanyAvatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getJobBoardListings } from "@/lib/dashboard/jobs";
import { getTrackerPage } from "@/lib/dashboard/tracker";
import { hasActiveSubscription } from "@/lib/billing/access";
import { CHROME_EXTENSION_URL } from "@/lib/site";
import type { JobListing } from "@/lib/dashboard/sample-data";
import type { TrackerItem } from "@/lib/dashboard/tracker-model";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Dashboard" };

type TrackerPage = Awaited<ReturnType<typeof getTrackerPage>>;

type DashboardUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type SetupStatus = {
  completed: boolean;
  resumeReady: boolean;
  updatedAt: string | null;
};

type Metric = {
  label: string;
  value: string;
  hint: string;
  Icon: LucideIcon;
  href: Route;
  tone: "tracked" | "active" | "review";
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function userName(user?: DashboardUser | null) {
  const metadata = user?.user_metadata ?? {};
  const fromMetadata =
    text(metadata.full_name) ||
    text(metadata.name) ||
    text(metadata.user_name) ||
    text(metadata.preferred_username);
  if (fromMetadata) return fromMetadata;

  const handle = user?.email?.split("@")[0]?.trim();
  if (!handle) return "Your workspace";
  return handle.replace(/[._-]+/g, " ");
}

function userInitials(user?: DashboardUser | null) {
  const parts = userName(user).split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : parts[0]?.slice(0, 2);
  return (letters || "JP").toUpperCase();
}

function userAvatarUrl(user?: DashboardUser | null) {
  const metadata = user?.user_metadata ?? {};
  return text(metadata.avatar_url) || text(metadata.picture) || null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Not dated";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stageLabel(stage: TrackerItem["stage"]) {
  if (stage === "inbox") return "Saved";
  if (stage === "applied") return "Applied";
  if (stage === "interview") return "Interview";
  if (stage === "offer") return "Offer";
  if (stage === "closed") return "Closed";
  return stage.replace(/^custom:/, "").replace(/[-_]/g, " ");
}

function StagePill({ stage }: { stage: TrackerItem["stage"] }) {
  const tone =
    stage === "interview" || stage === "offer"
      ? "bg-emerald-50 text-emerald-700"
      : stage === "closed"
        ? "bg-zinc-100 text-zinc-600"
        : "bg-brand-50 text-brand-700";
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", tone)}>{stageLabel(stage)}</span>;
}

function sourceLabel(source: TrackerItem["source"]) {
  if (source === "extension") return "Extension";
  if (source === "manual") return "Manual";
  if (source === "job_board") return "Job board";
  return "JobPosted";
}

async function getSetupStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<SetupStatus> {
  const [onboardingResult, profileResult] = await Promise.all([
    supabase
      .from("onboarding_configurations")
      .select("completed_at,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("active_resume_version_id,updated_at")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  return {
    completed: Boolean(onboardingResult.data?.completed_at),
    resumeReady: typeof profileResult.data?.active_resume_version_id === "string",
    updatedAt:
      text(onboardingResult.data?.updated_at) ||
      text(profileResult.data?.updated_at) ||
      text(onboardingResult.data?.completed_at) ||
      null,
  };
}

function UserProfileBadge({ user }: { user?: DashboardUser | null }) {
  const avatarUrl = userAvatarUrl(user);
  const name = userName(user);
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-white/75 px-3 py-2 ring-1 ring-inset ring-brand-100">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-sm font-black text-brand-700">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          userInitials(user)
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-ink">{name}</p>
        <p className="text-xs font-semibold text-muted">Job search workspace</p>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const tone = {
    tracked: {
      surface: "bg-metric-tracked hover:bg-metric-tracked-hover",
      icon: "bg-brand-100 text-brand-700",
    },
    active: {
      surface: "bg-metric-active hover:bg-metric-active-hover",
      icon: "bg-emerald-100 text-emerald-700",
    },
    review: {
      surface: "bg-metric-review hover:bg-metric-review-hover",
      icon: "bg-amber-100 text-amber-800",
    },
  }[metric.tone];

  return (
    <Link
      href={metric.href}
      className={cn(
        "group rounded-2xl p-4 shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)] transition-[transform,background-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-34px_rgba(31,100,224,0.3),0_4px_14px_-14px_rgba(15,23,42,0.18)]",
        tone.surface,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-muted">{metric.label}</p>
          <p className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-ink">{metric.value}</p>
        </div>
        <span className={cn("grid size-10 place-items-center rounded-xl", tone.icon)}>
          <metric.Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-5 text-muted">{metric.hint}</p>
    </Link>
  );
}

function PrimaryActionCard({
  href,
  Icon,
  title,
  description,
  action,
  external,
}: {
  href: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-extrabold tracking-[-0.015em] text-ink">{title}</h3>
        <p className="mt-1 text-sm font-semibold leading-6 text-muted">{description}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand-700">
          {action}
          {external ? <ExternalLink className="size-3.5" aria-hidden="true" /> : <ArrowRight className="size-3.5" aria-hidden="true" />}
        </span>
      </div>
    </>
  );

  const className =
    "flex min-h-36 items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-34px_rgba(31,100,224,0.3),0_4px_14px_-14px_rgba(15,23,42,0.18)]";

  if (external) {
    return (
      <a
        href={href}
        target={/^https?:\/\//i.test(href) ? "_blank" : undefined}
        rel={/^https?:\/\//i.test(href) ? "noreferrer" : undefined}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href as Route} className={className}>
      {content}
    </Link>
  );
}

function SetupReadiness({ setup, hasActivePlan }: { setup: SetupStatus; hasActivePlan: boolean }) {
  const items = [
    {
      label: "Profile details",
      done: setup.completed,
      detail: setup.completed ? "Saved for autofill" : "Add reusable answers",
    },
    {
      label: "Resume",
      done: setup.resumeReady,
      detail: setup.resumeReady ? "Ready for tailoring" : "Upload your master resume",
    },
    {
      label: "Extension",
      done: true,
      detail: "Use Chrome to save and fill jobs",
    },
  ];

  return (
    <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Workspace readiness</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted">
            Keep the data the extension reuses up to date.
          </p>
        </div>
        <UserRoundCheck className="size-5 text-brand-700" aria-hidden="true" />
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
              )}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink">{item.label}</p>
              <p className="text-xs font-semibold text-muted">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <Link
        href={hasActivePlan ? "/dashboard/onboarding" : "/pricing"}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white transition-colors hover:bg-brand-700"
      >
        {hasActivePlan ? "Open setup" : "Upgrade for setup"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function PipelineOverview({ tracker }: { tracker: TrackerPage }) {
  const rows = [
    { label: "Saved", value: tracker.summary.needsReview, color: "bg-amber-400" },
    { label: "Active", value: tracker.summary.activePipeline, color: "bg-brand-600" },
    { label: "All tracked", value: tracker.summary.tracked, color: "bg-emerald-500" },
  ];
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Tracker pipeline</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted">
            Saved, applied, interview, and offer stages from your tracker.
          </p>
        </div>
        <Workflow className="size-5 text-brand-700" aria-hidden="true" />
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-muted">{row.label}</span>
              <span className="text-sm font-extrabold text-ink">{row.value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <span
                className={cn("block h-full rounded-full", row.color)}
                style={{ width: row.value === 0 ? "0%" : `${Math.max(8, Math.round((row.value / max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentTracker({ items }: { items: TrackerItem[] }) {
  return (
    <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">Recent tracked roles</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Captured manually, from Jobs, or through the extension.</p>
        </div>
        <Link href="/dashboard/tracker" className="text-sm font-extrabold text-brand-700 hover:text-brand-800">
          Open
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <CompanyAvatar company={item.company} logoUrl={item.companyLogoUrl} colorSeed={item.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{item.role}</p>
                <p className="truncate text-xs font-semibold text-muted">
                  {item.company} · {sourceLabel(item.source)} · {formatDate(item.updatedAt)}
                </p>
              </div>
              <StagePill stage={item.stage} />
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-panel px-4 py-6 text-center">
            <p className="font-extrabold text-ink">No tracked roles yet</p>
            <p className="mt-1 text-sm font-semibold text-muted">Save a job or add an application to start your tracker.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FreshJobs({ jobs, total }: { jobs: JobListing[]; total: number }) {
  return (
    <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(7,26,51,0.38),0_4px_14px_-14px_rgba(15,23,42,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Fresh roles to review</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            {total > 0 ? `${total.toLocaleString()} open roles in the job board.` : "Browse new roles and save the ones worth tracking."}
          </p>
        </div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white transition-colors hover:bg-brand-700"
        >
          Browse jobs
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={{ pathname: "/dashboard/jobs", query: { q: job.company } }}
              className="group flex min-h-28 gap-3 rounded-2xl bg-panel px-4 py-3 transition-colors hover:bg-brand-50/70"
            >
              <CompanyAvatar company={job.company} logoUrl={job.companyLogoUrl} colorSeed={job.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-extrabold text-ink group-hover:text-brand-800">{job.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-muted">
                  {job.company} · {job.location}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[job.workplace, job.level, job.type].map((tag) => (
                    <span key={tag} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-muted ring-1 ring-inset ring-zinc-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-2xl bg-panel px-4 py-8 text-center lg:col-span-2">
            <p className="font-extrabold text-ink">No jobs loaded yet</p>
            <p className="mt-1 text-sm font-semibold text-muted">Open Jobs to search current boards.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AutofillButton({ hasActivePlan }: { hasActivePlan: boolean }) {
  const isExternal = /^https?:\/\//i.test(CHROME_EXTENSION_URL);
  const proBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-white">
      <Crown className="size-3" aria-hidden="true" />
      Pro
    </span>
  );

  const className =
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-extrabold text-white shadow-[0_14px_26px_-18px_rgba(11,18,32,0.55),0_3px_10px_-8px_rgba(15,23,42,0.18)] transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-[0_18px_32px_-20px_rgba(11,18,32,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  if (!hasActivePlan) {
    return (
      <Link href="/pricing" className={className}>
        <ChromeLogo className="size-4" />
        Autofill
        {proBadge}
      </Link>
    );
  }

  return (
    <a
      href={CHROME_EXTENSION_URL}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className={className}
    >
      <ChromeLogo className="size-4" />
      Autofill
      {proBadge}
    </a>
  );
}

function ExtensionCard() {
  return (
    <section className="rounded-[1.5rem] bg-ink p-5 text-white shadow-[0_22px_52px_-34px_rgba(11,18,32,0.58)]">
      <span className="grid size-11 place-items-center rounded-2xl bg-white/10">
        <ChromeLogo className="size-5" />
      </span>
      <h2 className="mt-4 text-xl font-extrabold tracking-[-0.02em]">Use the Chrome extension</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-white/72">
        Save roles, fill supported forms, and keep the tracker updated while you apply in your own browser.
      </p>
      <a
        href={CHROME_EXTENSION_URL}
        target={/^https?:\/\//i.test(CHROME_EXTENSION_URL) ? "_blank" : undefined}
        rel={/^https?:\/\//i.test(CHROME_EXTENSION_URL) ? "noreferrer" : undefined}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-ink transition-colors hover:bg-brand-50"
      >
        Get extension
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </section>
  );
}

function metricsFor(tracker: TrackerPage): Metric[] {
  return [
    {
      label: "Tracked roles",
      value: `${tracker.summary.tracked}`,
      hint: "Everything saved or applied",
      Icon: ClipboardList,
      href: "/dashboard/tracker",
      tone: "tracked",
    },
    {
      label: "Active pipeline",
      value: `${tracker.summary.activePipeline}`,
      hint: "Applied, replies, interviews, offers",
      Icon: Workflow,
      href: "/dashboard/tracker",
      tone: "active",
    },
    {
      label: "Saved to review",
      value: `${tracker.summary.needsReview}`,
      hint: "Roles waiting for a decision",
      Icon: FileCheck2,
      href: "/dashboard/tracker",
      tone: "review",
    },
  ];
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tracker, jobBoard, hasActivePlan, setup] = await Promise.all([
    getTrackerPage({ limit: 6, sort: "recent" }),
    getJobBoardListings({ pageSize: "4", hideTracked: "1", sort: "recent" }),
    user ? hasActiveSubscription(supabase, user.id) : Promise.resolve(false),
    user
      ? getSetupStatus(supabase, user.id)
      : Promise.resolve({ completed: false, resumeReady: false, updatedAt: null }),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-white p-5 shadow-[0_24px_64px_-48px_rgba(7,26,51,0.48),0_8px_22px_-18px_rgba(15,23,42,0.16)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-[-0.035em] text-ink sm:text-5xl">
              Your job search command center
            </h1>
            <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-muted">
              Find relevant roles, save the ones worth pursuing, and keep every application moving through your tracker.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AutofillButton hasActivePlan={hasActivePlan} />
            <UserProfileBadge user={user} />
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {metricsFor(tracker).map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <PrimaryActionCard
          href="/dashboard/jobs"
          Icon={Search}
          title="Find jobs"
          description="Search current roles, filter by company or location, and hide jobs already in your tracker."
          action="Open job board"
        />
        <PrimaryActionCard
          href="/dashboard/tracker"
          Icon={Workflow}
          title="Manage tracker"
          description="Move applications through saved, applied, interview, offer, and closed stages."
          action="Open tracker"
        />
        <PrimaryActionCard
          href={hasActivePlan ? "/dashboard/onboarding" : "/pricing"}
          Icon={Sparkles}
          title={hasActivePlan ? "Refresh setup" : "Unlock setup"}
          description={
            hasActivePlan
              ? "Keep your resume, profile, and reusable form answers current for the extension."
              : "Upgrade when you want profile setup, resume tailoring, and reusable answers."
          }
          action={hasActivePlan ? "Open setup" : "View pricing"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)]">
        <div className="space-y-5">
          <FreshJobs jobs={jobBoard.jobs} total={jobBoard.total} />
          <RecentTracker items={tracker.items} />
        </div>

        <aside className="space-y-5">
          <ExtensionCard />
          <SetupReadiness setup={setup} hasActivePlan={hasActivePlan} />
          <PipelineOverview tracker={tracker} />
        </aside>
      </div>
    </div>
  );
}
