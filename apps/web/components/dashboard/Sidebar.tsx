"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ListChecks, CreditCard, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Job feed", icon: LayoutGrid, exact: true },
  { href: "/dashboard/queue", label: "Review queue", icon: ListChecks, exact: false },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-zinc-100 md:h-screen md:w-60 md:border-r md:p-4">
      <div className="hidden px-2 py-3 md:block">
        <Link href="/dashboard" aria-label="JobPosted home">
          <Logo />
        </Link>
      </div>

      <nav className="flex gap-1 md:flex-col">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:flex-none",
                active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-zinc-50 hover:text-ink",
              )}
            >
              <item.icon className="size-4.5" strokeWidth={2} />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-2 border-t border-zinc-100 px-2 pt-4 md:flex">
        {userEmail && <p className="truncate px-1 text-xs text-muted">{userEmail}</p>}
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-zinc-50 hover:text-ink"
          >
            <LogOut className="size-4.5" strokeWidth={2} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
