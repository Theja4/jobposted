import { ArrowUpRight, Mail, MessageCircle, Send, Sparkles } from "lucide-react";
import { Logo } from "./Logo";
import { SITE_NAME } from "@/lib/site";

const FOOTER_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "https://rezoomed.com", label: "Rezoomed" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function Footer({ seamless = false }: { seamless?: boolean }) {
  return (
    <footer
      className={
        seamless
          ? "relative -mt-16 overflow-hidden bg-transparent px-5 pt-32 text-ink sm:-mt-20 sm:pt-36"
          : "relative -mt-16 overflow-hidden bg-[linear-gradient(180deg,#ddecff_0%,#cfe4ff_28%,#b6d6ff_64%,#9ec4ff_100%)] px-5 pt-32 text-ink sm:-mt-20 sm:pt-36"
      }
    >
      {!seamless && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,#ddecff_0%,rgba(221,236,255,0.72)_42%,rgba(221,236,255,0)_100%)]"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.5),transparent_30%),radial-gradient(circle_at_18%_72%,rgba(31,100,224,0.16),transparent_30%),radial-gradient(circle_at_86%_76%,rgba(22,199,212,0.14),transparent_26%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-3.6rem] select-none text-center text-[19vw] font-extrabold leading-none text-white/20 sm:bottom-[-4.8rem]"
      >
        {SITE_NAME}
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 pb-28 md:grid-cols-[1fr_1.1fr_1fr] md:items-start md:pb-32">
        <div>
          <Logo />
          <div className="mt-7 flex gap-3">
            <SocialLink href="mailto:hello@jobposted.com" label="Email JobPosted">
              <Mail className="size-4" />
            </SocialLink>
            <SocialLink href="#waitlist" label="Join product updates">
              <Send className="size-4" />
            </SocialLink>
            <SocialLink href="#faq" label="Read answers">
              <MessageCircle className="size-4" />
            </SocialLink>
          </div>

          <a
            href="mailto:hello@jobposted.com"
            className="mt-7 inline-block text-lg font-semibold text-ink transition-colors hover:text-brand-700"
          >
            hello@jobposted.com
          </a>
          <p className="mt-5 max-w-[17rem] text-sm leading-6 text-ink/62">
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
        </div>

        <div className="relative flex min-h-44 items-center justify-center">
          <DecorativePanel className="left-0 hidden md:block" />
          <DecorativePanel className="right-0 hidden scale-x-[-1] md:block" />
          <a
            href="#waitlist"
            className="group relative inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(7,26,51,0.22)] transition duration-200 hover:-translate-y-1 hover:bg-brand-700 hover:shadow-[0_18px_36px_rgba(31,100,224,0.24)]"
          >
            Join waitlist
            <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              Free
            </span>
            <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <nav className="flex flex-col items-start gap-4 text-base font-semibold md:items-end">
          {FOOTER_LINKS.map((link) => (
            <FooterLink key={link.href} href={link.href}>
              {link.label}
            </FooterLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="transition duration-200 hover:translate-x-1 hover:text-brand-700">
      {children}
    </a>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full bg-white/62 text-ink ring-1 ring-inset ring-white/70 backdrop-blur transition duration-200 hover:-translate-y-1 hover:bg-white hover:text-brand-700 hover:shadow-[0_12px_26px_rgba(31,100,224,0.18)]"
    >
      {children}
    </a>
  );
}

function DecorativePanel({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute top-1/2 h-32 w-28 -translate-y-1/2 border-y border-white/55 bg-[radial-gradient(circle,rgba(31,100,224,0.35)_1px,transparent_1.5px)] [background-size:9px_9px] opacity-70 ${className}`}
    >
      <Sparkles className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 text-brand-600/60" />
    </div>
  );
}
