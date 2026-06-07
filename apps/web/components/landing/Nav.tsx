import Link from "next/link";
import { Logo } from "./Logo";
import { CTAButton } from "@/components/ui/CTAButton";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="JobPosted home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <a
            href="#pricing"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-block"
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-block"
          >
            FAQ
          </a>
          <CTAButton href="#waitlist" size="sm" event="nav_cta_click">
            Get early access
          </CTAButton>
        </div>
      </nav>
    </header>
  );
}
