import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import { PLANS, TRIAL_APPLICATION_LIMIT, type Plan, type AtsType } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuotaMeter } from "@/components/dashboard/QuotaMeter";
import { ReviewItem, type ReviewItemData } from "@/components/dashboard/ReviewItem";
import { applyMethodLabel } from "@/lib/feed-types";

export const metadata = { title: "Review queue" };

interface AppRow {
  id: string;
  status: string;
  apply_path: string;
  created_at: string;
  submitted_at: string | null;
  failure_reason: string | null;
  screenshot_path: string | null;
  field_map: { fields?: unknown[] } | null;
  jobs: {
    company: string | null;
    title: string | null;
    ats_type: string | null;
    apply_url: string | null;
  } | null;
}

const IN_PROGRESS = new Set(["queued", "tailoring", "submitting"]);

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, daily_limit")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id,status,apply_path,created_at,submitted_at,failure_reason,screenshot_path,field_map,jobs(company,title,ats_type,apply_url)",
    )
    .order("created_at", { ascending: false })
    .returns<AppRow[]>();
  const apps = rows ?? [];

  const ready = apps.filter((a) => a.status === "ready_for_review");
  const inProgress = apps.filter((a) => IN_PROGRESS.has(a.status));
  const submitted = apps.filter((a) => a.status === "submitted");
  const failed = apps.filter((a) => a.status === "failed");

  // Signed URLs for the parked screenshots (owner-readable via Storage RLS).
  const reviewItems: ReviewItemData[] = await Promise.all(
    ready.map(async (a): Promise<ReviewItemData> => {
      let screenshotUrl: string | null = null;
      if (a.screenshot_path) {
        const { data } = await supabase.storage
          .from("screenshots")
          .createSignedUrl(a.screenshot_path, 300);
        screenshotUrl = data?.signedUrl ?? null;
      }
      return {
        id: a.id,
        title: a.jobs?.title ?? "Job",
        company: a.jobs?.company ?? "—",
        screenshotUrl,
        fieldCount: a.field_map?.fields?.length ?? 0,
        applyUrl: a.jobs?.apply_url ?? null,
      };
    }),
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const appliedToday = submitted.filter(
    (a) => a.submitted_at && new Date(a.submitted_at) >= startOfToday,
  ).length;
  const plan = sub?.plan as Plan | undefined;
  const cap = sub?.daily_limit ?? TRIAL_APPLICATION_LIMIT;
  const planLabel = plan ? PLANS[plan].name : "Trial";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Review queue</h1>
        <p className="mt-1 text-sm text-muted">
          You confirm every submission — nothing goes out without your OK.
        </p>
      </header>

      <div className="mb-8">
        <QuotaMeter
          appliedToday={appliedToday}
          cap={cap}
          planLabel={planLabel}
          relevantToday={ready.length + inProgress.length}
        />
      </div>

      {/* Ready to review */}
      <Section title="Ready to review" count={ready.length}>
        {reviewItems.length === 0 ? (
          <Empty icon={<Info className="size-4" />}>
            Nothing to review yet. Queued roles are tailored and filled by the apply engine, then
            appear here with a screenshot before anything is submitted.
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {reviewItems.map((item) => (
              <ReviewItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </Section>

      {/* In progress */}
      {inProgress.length > 0 && (
        <Section title="In progress" count={inProgress.length}>
          <ul className="flex flex-col gap-2">
            {inProgress.map((a) => (
              <Row
                key={a.id}
                title={a.jobs?.title}
                company={a.jobs?.company}
                badge={a.status}
                tone="zinc"
                icon={<Clock className="size-3" />}
                method={applyMethodLabel((a.jobs?.ats_type ?? "other") as AtsType).label}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* Needs attention */}
      {failed.length > 0 && (
        <Section title="Needs attention" count={failed.length}>
          <ul className="flex flex-col gap-2">
            {failed.map((a) => (
              <Row
                key={a.id}
                title={a.jobs?.title}
                company={a.jobs?.company}
                badge={a.failure_reason?.startsWith("challenge") ? "needs manual apply" : "failed"}
                tone="amber"
                icon={<AlertTriangle className="size-3" />}
                href={a.jobs?.apply_url ?? undefined}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* Submitted */}
      {submitted.length > 0 && (
        <Section title="Submitted" count={submitted.length}>
          <ul className="flex flex-col gap-2">
            {submitted.map((a) => (
              <Row
                key={a.id}
                title={a.jobs?.title}
                company={a.jobs?.company}
                badge="submitted"
                tone="brand"
                icon={<CheckCircle2 className="size-3" />}
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
        {title} {count > 0 && <span className="text-zinc-400">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function Row({
  title,
  company,
  badge,
  tone,
  icon,
  method,
  href,
}: {
  title?: string | null;
  company?: string | null;
  badge: string;
  tone: "zinc" | "amber" | "brand";
  icon: React.ReactNode;
  method?: string;
  href?: string;
}) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-600",
    amber: "bg-amber-50 text-amber-700",
    brand: "bg-brand-50 text-brand-700",
  } as const;
  const inner = (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white p-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{title ?? "Job"}</p>
        <p className="truncate text-sm text-muted">{company ?? "—"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {method && <span className="hidden text-xs text-muted sm:inline">{method}</span>}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
        >
          {icon} {badge}
        </span>
      </div>
    </div>
  );
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
          {inner}
        </a>
      ) : (
        inner
      )}
    </li>
  );
}
