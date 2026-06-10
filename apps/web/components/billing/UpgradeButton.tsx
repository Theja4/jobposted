"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Plan } from "@jobposted/shared";
import { buttonClasses } from "@/components/ui/button";

/** Starts a Creem checkout for a plan and redirects to the hosted page. */
export function UpgradeButton({
  plan,
  label,
  variant = "primary",
}: {
  plan: Plan;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function go() {
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setStatus("error");
        setMessage(
          res.status === 503 ? "Checkout isn't enabled yet — coming soon." : data.error ?? "Couldn't start checkout.",
        );
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <div className="w-full">
      <button onClick={go} disabled={status === "loading"} className={buttonClasses(variant, "lg", "w-full")}>
        {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : label}
      </button>
      {status === "error" && <p className="mt-2 text-center text-xs text-amber-700">{message}</p>}
    </div>
  );
}
