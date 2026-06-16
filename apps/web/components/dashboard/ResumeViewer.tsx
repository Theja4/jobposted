"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { JobApplication } from "@/lib/dashboard/sample-data";
import { cn } from "@/lib/cn";

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function ViewResumeButton({ application }: { application: JobApplication }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const resumeUrl = application.resumeUrl && application.resumeUrl !== "#" ? application.resumeUrl : "";
  const available = Boolean(resumeUrl);

  async function openResume() {
    if (!available || busy) return;
    setBusy(true);
    setError(false);
    try {
      let url = resumeUrl;
      if (!isExternalUrl(resumeUrl)) {
        const res = await fetch(`/api/resume/signed-url?path=${encodeURIComponent(resumeUrl)}`);
        const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: string | null } | null;
        if (!res.ok || body?.ok !== true || !body.url) throw new Error("sign_failed");
        url = body.url;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openResume}
      disabled={!available || busy}
      title={available ? application.resumeName : "Resume artifact is not available yet"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-colors",
        available
          ? "bg-white text-brand-700 ring-brand-200/70 hover:bg-brand-50 hover:ring-brand-300"
          : "cursor-not-allowed bg-zinc-50 text-zinc-400 ring-zinc-200/70",
        error && "bg-red-50 text-red-600 ring-red-200",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
      {error ? "Unavailable" : "View resume"}
    </button>
  );
}
