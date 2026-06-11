import { Reveal } from "@/components/ui/Reveal";

/** Companies whose live roles JobPosted ingests (real — Greenhouse/Lever/Ashby boards). */
const COMPANIES = [
  "Stripe",
  "OpenAI",
  "Airbnb",
  "Figma",
  "Databricks",
  "Ramp",
  "Notion",
  "Linear",
  "Vanta",
  "Cohere",
  "ElevenLabs",
  "Perplexity",
  "Discord",
  "Anthropic",
];

export function SocialProof() {
  return (
    <section className="-mt-px bg-[#f7fbff] pt-2 pb-12">
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
                    key={company}
                    className="text-2xl font-extrabold tracking-[-0.035em] whitespace-nowrap text-slate-300/80 transition-colors duration-200 hover:text-brand-600"
                  >
                    {company}
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
