"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BridgeState = "checking" | "sent" | "signed-out" | "error";

export function ExtensionBridgeClient({ requestId }: { requestId?: string }) {
  const [state, setState] = useState<BridgeState>("checking");
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let stopId: number | null = null;
    async function deliver() {
      if (!supabase) {
        setState("error");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      if (error || !session) {
        setState("signed-out");
        return;
      }
      const payload = {
        type: "JOBPOSTED_EXTENSION_SESSION",
        requestId,
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at,
          user: session.user
            ? { id: session.user.id, email: session.user.email ?? null }
            : null,
        },
      };
      window.postMessage(payload, window.location.origin);
      intervalId = window.setInterval(() => {
        window.postMessage(payload, window.location.origin);
      }, 500);
      stopId = window.setTimeout(() => {
        if (intervalId) window.clearInterval(intervalId);
        intervalId = null;
      }, 8_000);
      setState("sent");
    }
    void deliver();
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (stopId) window.clearTimeout(stopId);
    };
  }, [requestId, supabase]);

  return (
    <main className="grid min-h-svh place-items-center bg-panel px-5 py-10 text-ink">
      <section className="liquid-glass w-full max-w-md rounded-[1.5rem] p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          {state === "checking" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : state === "sent" ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <ShieldCheck className="size-5" />
          )}
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.02em]">
          {state === "sent"
            ? "JobPosted extension connected"
            : state === "signed-out"
              ? "Sign in to connect"
              : state === "error"
                ? "Connection unavailable"
                : "Connecting the extension"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {state === "sent"
            ? "You can return to the application tab. Your extension now has your JobPosted session."
            : state === "signed-out"
              ? "Use your JobPosted account first, then the extension can reuse that browser session."
              : state === "error"
                ? "The JobPosted web app is missing its Supabase configuration."
                : "Keep this tab open for a moment while Chrome receives your session."}
        </p>
        {state === "signed-out" && (
          <Link
            href={{
              pathname: "/get-started",
              query: { mode: "signin", next: "/extension/bridge" },
            }}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-black text-white transition-colors hover:bg-brand-700"
          >
            Sign in
          </Link>
        )}
      </section>
    </main>
  );
}
