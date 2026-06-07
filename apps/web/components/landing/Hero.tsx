import { ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { WaitlistForm } from "./WaitlistForm";
import { ProductLoop } from "./ProductLoop";

export function Hero() {
  return (
    <section className="px-5 pt-16 pb-20 sm:pt-20 sm:pb-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        {/* Left: promise + waitlist */}
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
              <ShieldCheck className="size-3.5" />
              Copilot, not autopilot
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
              Apply to the right jobs <span className="text-brand-600">while you sleep</span>.
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted">
              JobPosted finds roles that match you, tailors your resume to each one with
              Rezoomed, and fills the application — then <strong>you confirm</strong> before
              anything is submitted. We never spray, and your LinkedIn never runs from our
              servers.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div id="waitlist" className="mt-8 max-w-md scroll-mt-24">
              <WaitlistForm />
              <p className="mt-3 text-sm text-muted">
                Apply to your first <strong className="text-ink">5 jobs free</strong>, then
                $19/mo. No credit card to join the waitlist.
              </p>
            </div>
          </Reveal>
        </div>

        {/* Right: product loop */}
        <Reveal delay={0.1} className="lg:pl-4">
          <ProductLoop />
        </Reveal>
      </div>
    </section>
  );
}
