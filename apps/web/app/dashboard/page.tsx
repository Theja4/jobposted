import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Crown,
  Gauge,
  ListChecks,
  Send,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { CompanyAvatar } from "@/components/dashboard/CompanyAvatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDashboardApplications,
  getDashboardQueue,
  getDashboardStats,
} from "@/lib/dashboard/applications";
import { getTrackerPage } from "@/lib/dashboard/tracker";
import { hasActiveSubscription } from "@/lib/billing/access";
import { STATUS_META, type JobApplication } from "@/lib/dashboard/sample-data";
import type { TrackerItem } from "@/lib/dashboard/tracker-model";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Dashboard" };

type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
type DashboardQueue = Awaited<ReturnType<typeof getDashboardQueue>>;
type TrackerPage = Awaited<ReturnType<typeof getTrackerPage>>;

type DashboardUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
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

function queueCopy(queue: DashboardQueue) {
  if (queue.today.length > 0) {
    return queue.mode === "review" ? "ready for review" : "queued today";
  }
  return queue.mode === "review" ? "no review items" : "nothing queued";
}

function statTiles(stats: DashboardStats, queue: DashboardQueue, tracker: TrackerPage) {
  return [
    {
      label: "Queue today",
      value: `${queue.today.length}`,
      hint: queueCopy(queue),
      href: "/dashboard/queue",
      Icon: ListChecks,
      primary: true,
    },
    {
      label: "Active pipeline",
      value: `${tracker.summary.activePipeline}`,
      hint: "roles in motion",
      href: "/dashboard/tracker",
      Icon: Workflow,
    },
    {
      label: "Sent this week",
      value: `${stats.sentThisWeek}`,
      hint: `${stats.responses} responses tracked`,
      href: "/dashboard/applications",
      Icon: Send,
    },
    {
      label: "Avg match",
      value: `${stats.avgMatch}%`,
      hint: "JobPosted-prepared roles",
      href: "/dashboard/applications",
      Icon: Gauge,
    },
  ] as const;
}

function stageLabel(stage: TrackerItem["stage"]) {
  if (stage === "inbox") return "To review";
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
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black capitalize", tone)}>
      {stageLabel(stage)}
    </span>
  );
}

function ApplicationStatusPill({ status }: { status: JobApplication["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", meta.className)}>
      {meta.label}
    </span>
  );
}

function UserProfileBadge({ user }: { user?: DashboardUser | null }) {
  const avatarUrl = userAvatarUrl(user);
  const name = userName(user);
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-panel px-3 py-2 ring-1 ring-inset ring-brand-100">
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
        <p className="text-xs font-semibold text-muted">Signed in</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
  Icon,
  primary,
}: {
  label: string;
  value: string;
  hint: string;
  href: Route;
  Icon: LucideIcon;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative min-h-36 overflow-hidden rounded-[1.35rem] p-5 shadow-[0_20px_46px_-34px_rgba(7,26,51,0.46),0_6px_18px_-16px_rgba(15,23,42,0.18)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_24px_54px_-34px_rgba(31,100,224,0.34),0_6px_18px_-16px_rgba(15,23,42,0.22)]",
        primary ? "bg-brand-600 text-white" : "bg-white text-ink",
      )}
    >
      {primary && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(24rem_12rem_at_80%_0%,rgba(255,255,255,0.25),transparent_64%)]"
        />
      )}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className={cn("text-sm font-extrabold", primary ? "text-white/82" : "text-muted")}>{label}</p>
          <p className="mt-5 text-5xl font-extrabold tracking-[-0.04em]">{value}</p>
        </div>
        <span
          className={cn(
            "grid size-11 place-items-center rounded-full",
            primary ? "bg-white text-brand-700" : "bg-brand-50 text-brand-700",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className={cn("relative mt-3 text-sm font-bold", primary ? "text-white/78" : "text-muted")}>{hint}</p>
    </Link>
  );
}

function TodayFocus({ queue }: { queue: DashboardQueue }) {
  const hasItems = queue.today.length > 0;
  const focusHref = (hasItems ? "/dashboard/queue" : "/dashboard/jobs") as Route;
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_22px_52px_-38px_rgba(7,26,51,0.42),0_6px_18px_-16px_rgba(15,23,42,0.14)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-extrabold text-brand-700">Today&apos;s focus</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-ink">
            {hasItems ? `${queue.today.length} applications need attention` : "No queue items waiting"}
          </h2>
          <p className="mt-1 max-w-xl text-sm font-semibold leading-6 text-muted">
            {hasItems
              ? queue.mode === "review"
                ? "Review the prepared batch, then decide what goes out. Nothing is submitted without you."
                : "These applications are in today's JobPosted queue."
              : "Use Jobs to find new roles or Tracker to log anything you handled yourself."}
          </p>
        </div>
        <Link
          href={focusHref}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-extrabold text-white shadow-[0_16px_30px_-20px_rgba(31,100,224,0.7)] transition-colors hover:bg-brand-700"
        >
          {hasItems ? "Open queue" : "Browse jobs"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 space-y-2.5">
        {hasItems ? (
          queue.today.slice(0, 4).map((application) => (
            <div
              key={application.id}
              className="flex items-center gap-3 rounded-2xl bg-panel px-3.5 py-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.35)]"
            >
              <CompanyAvatar company={application.company} logoUrl={application.companyLogoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{application.role}</p>
                <p className="truncate text-xs font-semibold text-muted">
                  {application.company} · {application.matchScore}% match
                </p>
              </div>
              <ApplicationStatusPill status={application.status} />
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-panel px-4 py-5">
            <p className="text-sm font-bold leading-6 text-muted">
              Browse jobs from the search above, or use Tracker for roles you applied to yourself.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function PipelineSnapshot({ tracker, stats }: { tracker: TrackerPage; stats: DashboardStats }) {
  const max = Math.max(tracker.summary.tracked, tracker.summary.activePipeline, tracker.summary.needsReview, 1);
  const rows = [
    { label: "Tracked roles", value: tracker.summary.tracked, color: "bg-brand-600" },
    { label: "Needs review", value: tracker.summary.needsReview, color: "bg-amber-400" },
    { label: "Active pipeline", value: tracker.summary.activePipeline, color: "bg-emerald-500" },
  ];

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_22px_52px_-38px_rgba(7,26,51,0.42),0_6px_18px_-16px_rgba(15,23,42,0.14)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Pipeline snapshot</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Tracker and JobPosted activity together.</p>
        </div>
        <CalendarCheck className="size-5 text-brand-700" aria-hidden="true" />
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
                style={{ width: `${Math.max(6, Math.round((row.value / max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-brand-50 px-4 py-3">
        <p className="text-xs font-black tracking-[0.08em] text-brand-700 uppercase">Quality signal</p>
        <p className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-ink">{stats.avgMatch}% avg match</p>
      </div>
    </section>
  );
}

function RecentTracker({ items }: { items: TrackerItem[] }) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_22px_52px_-38px_rgba(7,26,51,0.42),0_6px_18px_-16px_rgba(15,23,42,0.14)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Recent tracker roles</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Manual, extension, and JobPosted activity.</p>
        </div>
        <Link href="/dashboard/tracker" className="text-sm font-extrabold text-brand-700 hover:text-brand-800">
          Open
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <CompanyAvatar company={item.company} logoUrl={item.companyLogoUrl} colorSeed={item.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{item.role}</p>
                <p className="truncate text-xs font-semibold text-muted">
                  {item.company} · {formatDate(item.updatedAt)}
                </p>
              </div>
              <StagePill stage={item.stage} />
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-panel px-4 py-6 text-center">
            <p className="font-extrabold text-ink">No tracked roles yet</p>
            <p className="mt-1 text-sm font-semibold text-muted">Add roles you apply to manually.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function RecentApplications({ applications }: { applications: JobApplication[] }) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_22px_52px_-38px_rgba(7,26,51,0.42),0_6px_18px_-16px_rgba(15,23,42,0.14)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Recent JobPosted applications</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Only applications prepared by JobPosted appear here.</p>
        </div>
        <Link href="/dashboard/applications" className="text-sm font-extrabold text-brand-700 hover:text-brand-800">
          View history
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {applications.length > 0 ? (
          applications.slice(0, 5).map((application) => (
            <div
              key={application.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-panel px-3.5 py-3"
            >
              <CompanyAvatar company={application.company} logoUrl={application.companyLogoUrl} size="sm" />
              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{application.role}</p>
                <p className="truncate text-xs font-semibold text-muted">
                  {application.company} · {formatDate(application.appliedOn)}
                </p>
              </div>
              <span className="text-sm font-extrabold text-ink">{application.matchScore}%</span>
              <ApplicationStatusPill status={application.status} />
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-panel px-4 py-8 text-center">
            <p className="font-extrabold text-ink">No JobPosted applications yet</p>
            <p className="mt-1 text-sm font-semibold text-muted">When the queue prepares roles, they will show here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ProUpgradeCard() {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-brand-600 p-5 text-white shadow-[0_24px_60px_-34px_rgba(31,100,224,0.72)] sm:p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_14rem_at_85%_0%,rgba(255,255,255,0.24),transparent_62%)]"
      />
      <div className="relative">
        <span className="grid size-11 place-items-center rounded-2xl bg-white/16 text-white">
          <Crown className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-extrabold tracking-[-0.02em]">Unlock Pro</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/78">
          Pro prepares daily applications and unlocks Setup, Queue, and History. Jobs and Tracker
          stay available on the free account.
        </p>
        <Link
          href="/pricing"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-extrabold text-brand-700 transition-colors hover:bg-brand-50"
        >
          View pricing
        </Link>
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [applications, queue, stats, tracker, hasActivePlan] = await Promise.all([
    getDashboardApplications({ limit: 5 }),
    getDashboardQueue(),
    getDashboardStats(),
    getTrackerPage({ limit: 5, sort: "recent" }),
    user ? hasActiveSubscription(supabase, user.id) : Promise.resolve(false),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-white p-5 shadow-[0_24px_64px_-48px_rgba(7,26,51,0.48),0_8px_22px_-18px_rgba(15,23,42,0.16)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-ink sm:text-5xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-muted">
              Review today&apos;s queue and keep the tracker moving from one place.
            </p>
          </div>
          <UserProfileBadge user={user} />
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statTiles(stats, queue, tracker).map((tile) => (
            <StatCard key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.8fr)]">
        <div className="space-y-5">
          <TodayFocus queue={queue} />
          <RecentApplications applications={applications} />
        </div>

        <aside className="space-y-5">
          {!hasActivePlan && <ProUpgradeCard />}
          <PipelineSnapshot tracker={tracker} stats={stats} />
          <RecentTracker items={tracker.items} />
        </aside>
      </div>
    </div>
  );
}
