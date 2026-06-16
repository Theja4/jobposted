"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Settings2,
  UserCircle2,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { cn } from "@/lib/cn";
import { SignOutButton } from "./SignOutButton";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/dashboard/queue", label: "Queue", exact: false, icon: ListChecks },
  { href: "/dashboard/jobs", label: "Jobs", exact: false, icon: BriefcaseBusiness },
  { href: "/dashboard/onboarding", label: "Setup", exact: false, icon: Settings2 },
  { href: "/dashboard/applications", label: "History", exact: false, icon: Clock3 },
  { href: "/dashboard/tracker", label: "Tracker", exact: false, icon: Workflow },
  { href: "/dashboard/account", label: "Account", exact: false, icon: UserCircle2 },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-[88rem] items-center gap-3 px-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="JobPosted home"
          className="shrink-0 max-[640px]:max-w-11 max-[640px]:overflow-hidden"
        >
          <Logo className="text-[0.88rem] sm:text-[0.94rem]" />
        </Link>

        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full items-center justify-start gap-0.5 md:justify-center">
            {NAV_LINKS.map(({ href, label, exact, icon: Icon }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={{ pathname: href }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-bold transition-colors duration-150",
                    active
                      ? "text-brand-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600"
                      : "text-muted hover:bg-zinc-50 hover:text-ink",
                  )}
                >
                  <Icon className="size-[1.125rem]" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <SignOutButton className="h-11 shrink-0 rounded-lg px-2.5 text-xs text-coral ring-1 ring-inset ring-coral/15 hover:bg-coral/10 hover:text-coral max-[720px]:hidden" />
      </nav>
    </header>
  );
}
