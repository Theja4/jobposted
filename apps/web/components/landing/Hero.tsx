import { Play, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { WaitlistForm } from "./WaitlistForm";
import { ProductLoop } from "./ProductLoop";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-white px-5 pt-12 pb-16 sm:pt-16 sm:pb-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_28%,rgba(31,100,224,0.14),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
        <div className="relative z-10">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] text-white">
                New
              </span>
              Confirm-before-submit copilot
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mt-6 max-w-2xl text-5xl leading-[1.05] font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-6xl lg:text-[4.35rem]">
              Better job applications, ready for your review.
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-base leading-7 text-pretty text-muted">
              Match roles, tailor resumes, and queue filled applications. You make the final
              call.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div id="waitlist" className="mt-8 max-w-lg scroll-mt-24">
              <div className="max-w-md">
                <WaitlistForm ctaLabel="Join" />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <a
                  href="#how-it-works"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-ink ring-1 ring-inset ring-zinc-200 transition duration-150 hover:-translate-y-0.5 hover:bg-brand-50 hover:ring-brand-200"
                >
                  Preview
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-white">
                    <Play className="size-3 fill-white" />
                  </span>
                </a>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                  <ShieldCheck className="size-4 text-brand-600" />
                  5 free applications
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-9 flex items-center gap-3">
              <div className="flex -space-x-2">
                <AvatarBubble hair="#17345f" shirt="#60a5fa" skin="#f2c6a7" />
                <AvatarBubble hair="#5a2b18" shirt="#26c485" skin="#d99469" offset />
                <AvatarBubble hair="#111827" shirt="#ff6b5f" skin="#f6d0b6" />
                <AvatarBubble hair="#6d3b16" shirt="#f8b84e" skin="#b97854" offset />
              </div>
              <div>
                <p className="text-sm font-extrabold text-ink">1.2k+</p>
                <p className="text-xs font-medium text-muted">early applicants joining</p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative z-10">
          <ProductLoop />
        </Reveal>
      </div>
    </section>
  );
}

function AvatarBubble({
  hair,
  shirt,
  skin,
  offset = false,
}: {
  hair: string;
  shirt: string;
  skin: string;
  offset?: boolean;
}) {
  return (
    <span
      className="grid size-10 place-items-center overflow-hidden rounded-full bg-white ring-2 ring-white"
      style={{ transform: `translateY(${offset ? 2 : 0}px)` }}
    >
      <svg viewBox="0 0 44 44" className="size-full" aria-hidden="true">
        <rect width="44" height="44" rx="22" fill="#eff6ff" />
        <circle cx="22" cy="19" r="10" fill={skin} />
        <path
          d="M12 20c1-9 7-14 16-11 5 2 7 6 7 11-8-5-14-3-23 0z"
          fill={hair}
        />
        <path d="M8 43c2-10 8-15 14-15s12 5 14 15H8z" fill={shirt} />
        <circle cx="18" cy="20" r="1.3" fill="#0b1220" />
        <circle cx="26" cy="20" r="1.3" fill="#0b1220" />
        <path d="M18 25c3 2 6 2 8 0" stroke="#0b1220" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
