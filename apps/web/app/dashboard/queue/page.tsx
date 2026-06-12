import type { Metadata } from "next";
import { QueuePanel } from "@/components/dashboard/QueuePanel";
import { getDashboardQueue } from "@/lib/dashboard/applications";

export const metadata: Metadata = { title: "Today's queue" };

export default async function QueuePage() {
  const queue = await getDashboardQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Today&apos;s queue</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          JobPosted applies automatically each day. Acknowledge today&apos;s applications to keep
          tomorrow&apos;s running.
        </p>
      </div>

      <QueuePanel today={queue.today} tomorrow={queue.tomorrow} />
    </div>
  );
}
