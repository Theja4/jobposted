"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ExternalLink, ImageOff } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export interface ReviewItemData {
  id: string;
  title: string;
  company: string;
  screenshotUrl: string | null;
  fieldCount: number;
  applyUrl: string | null;
}

/** A parked application awaiting confirmation (design doc §10.4): screenshot + Confirm/Edit. */
export function ReviewItem({ item }: { item: ReviewItemData }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "confirming" | "submitting" | "error">("idle");

  async function confirm() {
    if (status !== "idle") return;
    setStatus("confirming");
    try {
      const res = await fetch(`/api/applications/${item.id}/confirm`, { method: "POST" });
      if (res.ok) {
        setStatus("submitting");
        router.refresh();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{item.title}</p>
          <p className="truncate text-sm text-muted">{item.company}</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {item.fieldCount} fields filled
        </span>
      </div>

      <div className="border-y border-zinc-100 bg-zinc-50">
        {item.screenshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.screenshotUrl}
            alt="Pre-submit screenshot of the filled application form"
            className="max-h-80 w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-zinc-400">
            <ImageOff className="size-4" /> Screenshot unavailable
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-4">
        {status === "submitting" ? (
          <span className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
            <Loader2 className="size-4 animate-spin" /> Submitting…
          </span>
        ) : (
          <button
            onClick={confirm}
            disabled={status === "confirming"}
            className={buttonClasses("primary", "md", "h-10 flex-1")}
          >
            {status === "confirming" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Confirming…
              </>
            ) : (
              <>
                <Check className="size-4" /> Confirm &amp; submit
              </>
            )}
          </button>
        )}
        {item.applyUrl && (
          <a
            href={item.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("secondary", "md", "h-10")}
          >
            <ExternalLink className="size-4" /> Open form
          </a>
        )}
      </div>
      {status === "error" && (
        <p className="px-4 pb-4 text-sm text-red-600">Couldn&apos;t confirm — try again.</p>
      )}
    </div>
  );
}
