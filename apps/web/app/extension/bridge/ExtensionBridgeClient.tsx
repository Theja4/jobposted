"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BridgeState = "checking" | "sending" | "sent" | "signed-out" | "error";

export function ExtensionBridgeClient({ requestId }: { requestId?: string }) {
  const [state, setState] = useState<BridgeState>("checking");
  const [message, setMessage] = useState("");
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
    let failId: number | null = null;
    const ack = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== "JOBPOSTED_EXTENSION_SESSION_ACK") return;
      if (requestId && data.requestId !== requestId) return;
      if (intervalId) window.clearInterval(intervalId);
      if (stopId) window.clearTimeout(stopId);
      if (failId) window.clearTimeout(failId);
      intervalId = null;
      stopId = null;
      failId = null;
      if (data.ok === true) {
        setState("sent");
        setMessage("");
      } else {
        setState("error");
        setMessage("Chrome did not confirm the extension session. Reload the extension and try again.");
      }
    };
    async function deliver() {
      if (!supabase) {
        setState("error");
        setMessage("The JobPosted web app is missing its Supabase configuration.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      let session = data.session;
      if (error || !session) {
        setState("signed-out");
        setMessage("");
        return;
      }
      if (session.refresh_token) {
        const refreshed = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });
        if (!cancelled && !refreshed.error && refreshed.data.session) {
          session = refreshed.data.session;
        }
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
      setState("sending");
      window.addEventListener("message", ack);
      window.postMessage(payload, window.location.origin);
      intervalId = window.setInterval(() => {
        window.postMessage(payload, window.location.origin);
      }, 500);
      stopId = window.setTimeout(() => {
        if (intervalId) window.clearInterval(intervalId);
        intervalId = null;
      }, 8_000);
      failId = window.setTimeout(() => {
        if (cancelled) return;
        setState("error");
        setMessage(
          "Chrome did not confirm the extension session. Make sure the JobPosted extension is installed and enabled.",
        );
      }, 10_000);
    }
    void deliver();
    return () => {
      cancelled = true;
      window.removeEventListener("message", ack);
      if (intervalId) window.clearInterval(intervalId);
      if (stopId) window.clearTimeout(stopId);
      if (failId) window.clearTimeout(failId);
    };
  }, [requestId, supabase]);

  const signInNext = requestId
    ? `/extension/bridge?requestId=${encodeURIComponent(requestId)}`
    : "/extension/bridge";

  return (
    <main className="grid min-h-svh place-items-center bg-panel px-5 py-10 text-ink">
      <section className="liquid-glass w-full max-w-md rounded-[1.5rem] p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          {state === "checking" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : state === "sending" ? (
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
                : state === "sending"
                  ? "Sending your session to Chrome"
                : "Connecting the extension"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {state === "sent"
            ? "You can return to the application tab. Your extension now has your JobPosted session."
            : state === "signed-out"
              ? "Use your JobPosted account first, then the extension can reuse that browser session."
              : state === "error"
                ? message || "The JobPosted web app could not finish the extension connection."
                : state === "sending"
                  ? "Keep this tab open while the extension stores your JobPosted session."
                : "Keep this tab open for a moment while Chrome receives your session."}
        </p>
        {state === "signed-out" && (
          <Link
            href={{
              pathname: "/get-started",
              query: { mode: "signin", next: signInNext },
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
