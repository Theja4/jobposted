"use client";

import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Opens the Creem customer portal to manage / cancel the subscription. */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; url?: string };
      if (res.ok && data.url) window.location.href = data.url;
      else setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button onClick={open} disabled={loading} className={buttonClasses("secondary", "md")}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
      Manage billing
    </button>
  );
}
