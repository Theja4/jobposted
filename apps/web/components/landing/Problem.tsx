import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

export function Problem() {
  return (
    <Section className="bg-zinc-50" innerClassName="max-w-3xl text-center">
      <Reveal>
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
          The problem
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">
          You&apos;re sending the same resume to 200 jobs — and hearing nothing.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted">
          Mass-applying with one generic resume is a numbers game you lose. The applications
          that actually get callbacks are the ones tailored to the role. Doing that by hand,
          for every job, is the part nobody has time for — so it doesn&apos;t happen.
        </p>
      </Reveal>
    </Section>
  );
}
