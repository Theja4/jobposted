import Link from "next/link";
import { Search } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFeed, prefsOf, rowToProfile, PROFILE_COLUMNS } from "@/lib/feed";
import { getEntitlement } from "@/lib/billing/entitlement";
import { JobCard } from "@/components/dashboard/JobCard";
import { PasteUrlBox } from "@/components/dashboard/PasteUrlBox";
import { UsageBanner } from "@/components/dashboard/UsageBanner";

export const metadata = { title: "Job feed" };

export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user!.id)
    .single();
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const prefs = prefsOf(profile);

  const { data: apps } = await supabase.from("applications").select("job_id");
  const queued = new Set((apps ?? []).map((a: { job_id: string }) => a.job_id));

  const feed = await getFeed({ prefs, profile, queuedJobIds: queued });
  const entitlement = await getEntitlement(user!.id);
  const firstName = profile?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Hi {firstName} 👋</h1>
        <p className="mt-1 text-sm text-muted">
          {feed.length > 0
            ? `${feed.length} role${feed.length === 1 ? "" : "s"} matched your profile.`
            : "No matches yet — try widening your titles or locations."}
        </p>
      </header>

      <UsageBanner entitlement={entitlement} />

      <div className="mb-6">
        <PasteUrlBox />
      </div>

      {feed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-400">
            <Search className="size-6" />
          </span>
          <p className="font-medium text-ink">No matching roles right now</p>
          <p className="max-w-sm text-sm text-muted">
            Add more target titles, skills, or locations so we can surface more roles for you.
          </p>
          <Link
            href="/dashboard/settings"
            className="text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Update preferences →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {feed.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
