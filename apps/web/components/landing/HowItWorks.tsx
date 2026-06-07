import { UserPlus, Wand2, CheckCheck } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

const STEPS = [
  {
    icon: UserPlus,
    title: "Build your profile once",
    body: "Upload your base resume. We parse it with Rezoomed and pre-fill your details, work authorization, and preferences — no 20-field wall.",
  },
  {
    icon: Wand2,
    title: "We find and tailor",
    body: "We surface roles that match your profile and tailor your resume to each one with Rezoomed's ATS engine, then fill the application form.",
  },
  {
    icon: CheckCheck,
    title: "You review and submit",
    body: "Every application waits in your review queue with the tailored resume and a screenshot of the filled form. One click confirms and submits.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Reveal className="max-w-2xl">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
          How it works
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">
          Three steps, then it runs in the background.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.07}>
            <div className="h-full rounded-2xl border border-zinc-100 bg-white p-6 transition-shadow duration-150 hover:shadow-md hover:shadow-brand-900/5">
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <step.icon className="size-5.5" strokeWidth={2} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-sm font-bold text-brand-600">{i + 1}</span>
                <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              </div>
              <p className="mt-2 text-sm text-pretty text-muted">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
