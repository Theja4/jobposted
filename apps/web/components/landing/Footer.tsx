import Link from "next/link";
import { Logo } from "./Logo";
import { SITE_NAME } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-white px-5 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-pretty text-muted">
            Apply to the right jobs while you sleep — tailored, confirmed by you, never sprayed.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
          <FooterLink href="#how-it-works">How it works</FooterLink>
          <FooterLink href="#pricing">Pricing</FooterLink>
          <FooterLink href="#faq">FAQ</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href="https://rezoomed.com">Rezoomed</FooterLink>
        </nav>
      </div>

      <div className="mx-auto mt-10 w-full max-w-6xl border-t border-zinc-100 pt-6 text-xs text-muted">
        © {new Date().getFullYear()} {SITE_NAME}. Powered by Rezoomed&apos;s tailoring engine.
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith("/");
  const cls = "text-muted transition-colors hover:text-ink";
  return isInternal ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
