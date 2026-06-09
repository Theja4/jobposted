"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Check } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** "Paste any job URL" box — routes the URL to the right ATS handler and queues it. */
export function PasteUrlBox() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || !url.trim()) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/jobs/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; ats?: string };
      if (res.ok && data.ok) {
        setStatus("done");
        setMessage(`Queued (${data.ats}).`);
        setUrl("");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
        setMessage(data.error ?? "Couldn't add that URL.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste any job URL (Greenhouse, Lever, LinkedIn…)"
          className="h-11 w-full rounded-xl bg-white pr-4 pl-10 text-sm text-ink ring-1 ring-inset ring-zinc-200 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button type="submit" disabled={status === "loading"} className={buttonClasses("secondary", "md")}>
        {status === "loading" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Adding…
          </>
        ) : status === "done" ? (
          <>
            <Check className="size-4 text-brand-600" /> Queued
          </>
        ) : (
          "Add job"
        )}
      </button>
      {status === "error" && <p className="self-center text-sm text-red-600">{message}</p>}
    </form>
  );
}
