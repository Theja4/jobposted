"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { useAuthUser } from "./useAuthUser";

/** Header actions that reflect auth state — used in the marketing Nav everywhere. */
export function NavAuthButtons() {
  const { user, loading } = useAuthUser();

  if (loading) {
    // Neutral placeholder to avoid a "Get started" → "My account" flash + layout shift.
    return <span className="h-11 w-32 animate-pulse rounded-full bg-ink/5" aria-hidden />;
  }

  if (user) {
    return (
      <Link
        href={{ pathname: "/dashboard" }}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(7,26,51,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_14px_30px_rgba(31,100,224,0.3)]"
      >
        <LayoutGrid className="size-4" />
        My account
      </Link>
    );
  }

  return (
    <Link
      href={{ pathname: "/get-started", query: { mode: "signin" } }}
      className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(7,26,51,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_14px_30px_rgba(31,100,224,0.3)]"
    >
      Sign in
    </Link>
  );
}
