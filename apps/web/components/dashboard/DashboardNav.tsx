"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Crown,
  LayoutDashboard,
  Settings2,
  UserCircle2,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { ChromeLogo } from "@/components/icons/ChromeLogo";
import { cn } from "@/lib/cn";
import { CHROME_EXTENSION_URL } from "@/lib/site";

function AutofillNavIcon({ className }: { className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return <ChromeLogo className={className} />;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/dashboard/jobs", label: "Jobs", exact: false, icon: BriefcaseBusiness },
  { href: CHROME_EXTENSION_URL, label: "Autofill", exact: false, icon: AutofillNavIcon, external: true },
  { href: "/dashboard/onboarding", label: "Setup", exact: false, icon: Settings2, pro: true },
  { href: "/dashboard/tracker", label: "Tracker", exact: false, icon: Workflow },
  { href: "/dashboard/account", label: "Account", exact: false, icon: UserCircle2 },
] as const;

type DashboardNavProps = {
  hasActivePlan: boolean;
};

export function DashboardNav({ hasActivePlan }: DashboardNavProps) {
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
            {NAV_LINKS.map((link) => {
              const { href, label, exact, icon: Icon } = link;
              const external = "external" in link && link.external;
              const active = !external && (exact ? pathname === href : pathname.startsWith(href));
              const className = cn(
                "relative inline-flex h-12 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-bold transition-[background-color,color,box-shadow] duration-150",
                active
                  ? "bg-brand-50 text-brand-700 shadow-[0_12px_24px_-18px_rgba(31,100,224,0.42),0_3px_10px_-9px_rgba(31,100,224,0.18)]"
                  : "text-muted hover:bg-zinc-50 hover:text-ink",
              );
              const content = (
                <>
                  <Icon className="size-[1.125rem]" aria-hidden="true" />
                  {label}
                </>
              );

              if (external) {
                const isExternalUrl = /^https?:\/\//i.test(href);
                return (
                  <a
                    key={label}
                    href={href}
                    target={isExternalUrl ? "_blank" : undefined}
                    rel={isExternalUrl ? "noreferrer" : undefined}
                    className={className}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <Link
                  key={href}
                  href={{ pathname: href }}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>

        {hasActivePlan ? (
          <a
            href={CHROME_EXTENSION_URL}
            target={/^https?:\/\//i.test(CHROME_EXTENSION_URL) ? "_blank" : undefined}
            rel={/^https?:\/\//i.test(CHROME_EXTENSION_URL) ? "noreferrer" : undefined}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 text-xs font-extrabold text-white shadow-[0_14px_26px_-18px_rgba(11,18,32,0.55),0_3px_10px_-8px_rgba(15,23,42,0.18)] transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-[0_18px_32px_-20px_rgba(11,18,32,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[720px]:hidden"
          >
            <ChromeLogo className="size-4" />
            Get extension
          </a>
        ) : (
          <Link
            href={"/dashboard/pricing" as Route}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 text-xs font-extrabold text-white shadow-[0_14px_26px_-18px_rgba(11,18,32,0.55),0_3px_10px_-8px_rgba(15,23,42,0.18)] transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-[0_18px_32px_-20px_rgba(11,18,32,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[720px]:hidden"
          >
            <Crown className="size-4" aria-hidden="true" />
            Upgrade to Pro
          </Link>
        )}
      </nav>
    </header>
  );
}
