"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

let initialized = false;

function initPostHog() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // analytics optional — no key, no-op
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // we capture manually on route change below
    person_profiles: "identified_only",
  });
  initialized = true;
}

/** Initializes PostHog (if configured) and captures a pageview on each route change. */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    posthog.capture("$pageview", { $current_url: window.location.href, pathname });
  }, [pathname]);

  return <>{children}</>;
}
