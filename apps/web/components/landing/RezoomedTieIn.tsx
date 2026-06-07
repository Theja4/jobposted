import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

export function RezoomedTieIn() {
  return (
    <Section innerClassName="max-w-4xl">
      <Reveal>
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-brand-100 bg-brand-50/60 px-6 py-10 text-center">
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
            Powered by Rezoomed
          </p>
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
            Every resume is tailored by Rezoomed&apos;s ATS engine.
          </h2>
          <p className="max-w-2xl text-pretty text-muted">
            JobPosted runs on the same tailoring engine that powers{" "}
            <a
              href="https://rezoomed.com"
              className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
            >
              Rezoomed
            </a>{" "}
            — so each application is optimized for the exact role, not a one-size-fits-all
            template.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
