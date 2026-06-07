import { Plus } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

const FAQS = [
  {
    q: "Will this get my LinkedIn or other accounts banned?",
    a: "No — that's the whole design. Logged-in platforms like LinkedIn and login-gated Workday only ever run inside your own browser session via our Chrome extension, at human pace — never from our servers' IPs. Open ATS forms (Greenhouse, Lever, Ashby) are submitted server-side, individually tailored and confirmed by you, never sprayed.",
  },
  {
    q: "What happens to my data and my resume?",
    a: "Your profile and resumes are stored securely with strict per-user isolation, and we never sell your data. Optional EEO/demographic fields are consented and firewalled from matching. We never store your LinkedIn or Workday passwords — the extension uses your existing logged-in session.",
  },
  {
    q: "Which platforms does it support?",
    a: "At launch: direct ATS — Greenhouse, Lever, and Ashby — applied to server-side, plus LinkedIn and login-Workday through the Chrome extension running in your own session. You can also paste any job URL and we'll route it to the right path.",
  },
  {
    q: "Do you guarantee a certain number of applications a day?",
    a: "We promise an honest \"up to.\" Your daily cap is an upper bound, gated by how many genuinely relevant roles are in your pool that day. You see a live count, and we'll suggest widening your titles or locations rather than padding your queue with bad matches.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: "You apply to your first 5 jobs free, before any charge — so you see it work before you pay. Plans are month-to-month and you can cancel anytime. (Full refund terms will be published before launch.)",
  },
];

export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <Section id="faq" innerClassName="max-w-3xl">
      <Reveal className="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">FAQ</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">
          The questions everyone asks first.
        </h2>
      </Reveal>

      <div className="mt-10 divide-y divide-zinc-100 border-y border-zinc-100">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
              <span className="text-base font-semibold text-ink">{f.q}</span>
              <Plus className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-open:rotate-45" />
            </summary>
            <p className="mt-3 text-pretty text-muted">{f.a}</p>
          </details>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </Section>
  );
}
