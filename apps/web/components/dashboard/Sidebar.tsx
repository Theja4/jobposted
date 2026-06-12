"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ListChecks,
  Compass,
  History,
  IdCard,
  KanbanSquare,
  UserCircle,
} from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { SignOutButton } from "./SignOutButton";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/dashboard/queue", label: "Today's queue", icon: ListChecks, exact: false },
  { href: "/dashboard/jobs", label: "Job board", icon: Compass, exact: false },
  { href: "/dashboard/applications", label: "Job application history", icon: History, exact: false },
  { href: "/dashboard/information", label: "My information", icon: IdCard, exact: false },
  { href: "/dashboard/tracker", label: "Job tracker", icon: KanbanSquare, exact: false },
  { href: "/dashboard/account", label: "Account", icon: UserCircle, exact: false },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-[17rem] shrink-0 flex-col border-r border-white/60 bg-white/55 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/" aria-label="JobPosted home" className="px-2">
        <Logo />
      </Link>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        <p className="px-3 pb-2 text-[11px] font-black tracking-[0.16em] text-muted uppercase">
          Overview
        </p>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={{ pathname: href }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors duration-150",
                active
                  ? "bg-brand-600 text-white shadow-[0_12px_28px_-10px_rgba(31,100,224,0.5)]"
                  : "text-ink/70 hover:bg-white hover:text-ink",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active ? "text-white" : "text-brand-600")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-2xl bg-white/70 p-4 ring-1 ring-inset ring-white">
        <p className="text-xs font-bold text-ink">Synced with Rezoomed</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Tailored resumes and match scores flow in automatically.
        </p>
        <SignOutButton className="mt-3" />
      </div>
    </aside>
  );
}

/** Compact horizontal nav shown on small screens where the sidebar is hidden. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={{ pathname: href }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
              active ? "bg-brand-600 text-white" : "bg-white/70 text-ink/70 hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
