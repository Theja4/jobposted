import Link from "next/link";
import { Logo } from "./Logo";
import { NavAuthButtons } from "@/components/auth/NavAuthButtons";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#analytics", label: "Results" },
  { href: "#trust", label: "Control" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
      <nav className="liquid-glass mx-auto flex h-16 w-full max-w-5xl items-center justify-between rounded-full pr-2 pl-5 sm:pl-6">
        <Link href="/" aria-label="JobPosted home" className="shrink-0">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink/72 transition-colors duration-150 hover:bg-white/70 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <NavAuthButtons />
        </div>
      </nav>
    </header>
  );
}
