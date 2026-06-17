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
  { href: "/dashboard/queue", label: "Queue", exact: false, icon: ListChecks, pro: true },
  { href: "/dashboard/jobs", label: "Jobs", exact: false, icon: BriefcaseBusiness },
  { href: "/dashboard/onboarding", label: "Setup", exact: false, icon: Settings2, pro: true },
  { href: "/dashboard/applications", label: "History", exact: false, icon: Clock3, pro: true },
  { href: "/dashboard/tracker", label: "Tracker", exact: false, icon: Workflow },
  { href: "/dashboard/account", label: "Account", exact: false, icon: UserCircle2 },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-transparent px-3 pt-3 sm:px-6">
      <nav className="mx-auto flex h-14 w-full max-w-[88rem] items-center gap-3 rounded-2xl bg-white/95 px-3 shadow-[0_14px_34px_rgba(16,47,102,0.11)] backdrop-blur-xl sm:px-4 lg:px-5">
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
                    "relative inline-flex h-12 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-bold transition-[background-color,color,box-shadow] duration-150",
                    active
                      ? "bg-brand-50 text-brand-700 shadow-[0_12px_24px_-18px_rgba(31,100,224,0.42),0_3px_10px_-9px_rgba(31,100,224,0.18)]"
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

        <SignOutButton className="h-11 shrink-0 rounded-lg px-2.5 text-xs text-coral shadow-[0_10px_20px_-17px_rgba(255,102,94,0.42),0_2px_8px_-7px_rgba(15,23,42,0.12)] transition-[background-color,color,box-shadow] hover:bg-coral/10 hover:text-coral hover:shadow-[0_14px_26px_-19px_rgba(255,102,94,0.5)] max-[720px]:hidden" />
      </nav>
    </header>
  );
}
