import type { Metadata } from "next";
import { JobTrackerBoard } from "@/components/dashboard/JobTrackerBoard";
import { getTrackerPage } from "@/lib/dashboard/tracker";

export const metadata: Metadata = { title: "Job tracker" };

export default async function TrackerPage() {
  const page = await getTrackerPage();

  return <JobTrackerBoard initialPage={page} />;
}
