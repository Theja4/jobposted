"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

export function ManageBillingButton({ supportEmail }: { supportEmail: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
      if (response.ok && payload?.url) {
        window.location.assign(payload.url);
        return;
      }
      setMessage(payload?.message || `Could not open the billing portal. Email ${supportEmail} for help.`);
    } catch {
      setMessage(`Could not open the billing portal. Email ${supportEmail} for help.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-full flex-col gap-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-[0_12px_26px_rgba(31,100,224,0.22)] transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:bg-brand-400"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
        Manage billing
      </button>
      {message ? <p className="max-w-md text-xs font-semibold leading-5 text-muted">{message}</p> : null}
    </div>
  );
}
