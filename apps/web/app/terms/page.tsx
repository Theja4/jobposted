import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${SITE_NAME}.`,
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main>
      <Nav />
      <article className="mx-auto w-full max-w-3xl px-5 py-16">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Draft — to be finalized with a lawyer before public launch (design doc §14, §14.1).
        </p>

        <h1 className="mt-8 text-3xl font-bold text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: draft</p>

        <Clause title="Copilot, not autopilot">
          {SITE_NAME} prepares applications and fills forms, but <strong>you</strong> confirm
          every submission. You are responsible for reviewing and approving each application
          before it is sent.
        </Clause>
        <Clause title="No guarantee of outcomes">
          We do not guarantee interviews, offers, or any particular number of applications per
          day. Daily caps are upper bounds gated by the relevant roles available to you.
        </Clause>
        <Clause title="Accuracy of your data">
          You are responsible for the accuracy of the information in your profile, resume, and
          application answers.
        </Clause>
        <Clause title="Acceptable use">
          Use {SITE_NAME} only for your own genuine job search. Do not use it to submit false
          information or to abuse employers&apos; systems.
        </Clause>
        <Clause title="Billing">
          Paid plans are month-to-month. Your first 5 applications are free before any charge.
          You can cancel at any time.
        </Clause>
      </article>
      <Footer />
    </main>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-pretty text-muted">{children}</p>
    </section>
  );
}
