import type { Metadata } from "next";
import { JobBoard } from "@/components/dashboard/JobBoard";
import { getJobBoardListings } from "@/lib/dashboard/jobs";

export const metadata: Metadata = { title: "Job board" };

export default async function JobBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const board = await getJobBoardListings(await searchParams);

  return (
    <div className="lg:flex lg:h-[calc(100svh-6rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <JobBoard {...board} />
    </div>
  );
}
