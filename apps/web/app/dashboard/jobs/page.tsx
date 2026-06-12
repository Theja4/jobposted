import type { Metadata } from "next";
import { JobBoard } from "@/components/dashboard/JobBoard";

export const metadata: Metadata = { title: "Job board" };

export default function JobBoardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Job board</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          Every role we&apos;ve matched for you — search by title, company, skill, or location.
        </p>
      </div>

      <JobBoard />
    </div>
  );
}
