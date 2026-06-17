import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { QueuePanel } from "@/components/dashboard/QueuePanel";
import { ModeToggle } from "@/components/dashboard/ModeToggle";
import { TailoringToggle } from "@/components/dashboard/TailoringToggle";
import { ProFeatureGate } from "@/components/dashboard/ProFeatureGate";
import { hasActiveSubscription } from "@/lib/billing/access";
import { getDashboardQueue } from "@/lib/dashboard/applications";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Today's queue" };

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(await hasActiveSubscription(supabase, user.id))) {
    return (
      <ProFeatureGate
        icon={ListChecks}
        title="Queue unlocks with Pro"
        description="This is where JobPosted holds prepared applications for your review."
        detail="Jobs and Tracker stay available on the free account. Upgrade when you want JobPosted to prepare daily applications for you."
      />
    );
  }
  const queue = await getDashboardQueue();
  const review = queue.mode === "review";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Today&apos;s queue</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          {review
            ? "Review today's tailored batch and queue it with one click. Nothing is submitted until you do."
            : "Only applications prepared by the JobPosted pipeline appear here. Manual and extension-captured roles stay in Tracker."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ModeToggle mode={queue.mode} />
        <TailoringToggle tailorResume={queue.tailorResume} />
      </div>

      <QueuePanel
        today={queue.today}
        initialAcknowledged={queue.acknowledged}
        mode={queue.mode}
      />
    </div>
  );
}
