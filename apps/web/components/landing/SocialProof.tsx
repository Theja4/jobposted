import type { CSSProperties } from "react";
import { Reveal } from "@/components/ui/Reveal";

/** Companies whose live roles JobPosted ingests (real — Greenhouse/Lever/Ashby boards). */
const COMPANIES = [
  { name: "Stripe", color: "#635BFF" },
  { name: "OpenAI", color: "#0F7F64" },
  { name: "Airbnb", color: "#FF385C" },
  { name: "Figma", color: "#A259FF" },
  { name: "Databricks", color: "#FF3621" },
  { name: "Ramp", color: "#00875F" },
  { name: "Notion", color: "#111111" },
  { name: "Linear", color: "#5E6AD2" },
  { name: "Vanta", color: "#3B5BFF" },
  { name: "Cohere", color: "#39594D" },
  { name: "ElevenLabs", color: "#111827" },
  { name: "Perplexity", color: "#16899A" },
  { name: "Discord", color: "#5865F2" },
  { name: "Anthropic", color: "#C15F3C" },
];

export function SocialProof() {
  return (
    <section className="relative z-10 bg-white pt-12 pb-12">
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <p className="text-center text-sm font-semibold text-muted/80">
            Pulling live roles from teams hiring now
          </p>
        </Reveal>

        <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="ticker-track flex min-w-max items-center gap-16">
            {[0, 1].map((group) => (
              <div key={group} className="flex items-center gap-16" aria-hidden={group === 1}>
                {COMPANIES.map((company) => (
                  <span
                    key={company.name}
                    style={{ "--company-color": company.color } as CSSProperties}
                    className="text-2xl font-extrabold tracking-[-0.035em] whitespace-nowrap text-slate-300/80 transition-colors duration-200 hover:text-[var(--company-color)]"
                  >
                    {company.name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
