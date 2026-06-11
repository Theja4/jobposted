import Link from "next/link";
import { Logo } from "./Logo";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-white/72 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="JobPosted home">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <NavLink href="#how-it-works">Features</NavLink>
          <NavLink href="#trust">Control</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#faq">Resource</NavLink>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#how-it-works"
            className="hidden h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-ink ring-1 ring-inset ring-zinc-200 transition duration-150 hover:bg-brand-50 sm:inline-flex"
          >
            Preview
          </a>
          <a
            href="#waitlist"
            className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-white transition duration-150 hover:-translate-y-0.5 hover:bg-brand-900"
          >
            Join
          </a>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-sm font-semibold text-ink/76 transition-colors hover:text-ink"
    >
      {children}
    </a>
  );
}
