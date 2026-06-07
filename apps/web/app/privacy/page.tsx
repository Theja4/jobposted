import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, stores, and lets you delete your data.`,
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main>
      <Nav />
      <article className="mx-auto w-full max-w-3xl px-5 py-16 prose-headings:font-semibold">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Draft — to be finalized with a privacy lawyer before public launch and before the
          Chrome Web Store review (design doc §14, §14.1).
        </p>

        <h1 className="mt-8 text-3xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: draft</p>

        <Clause title="What we collect">
          Your profile (name, contact, location, links), your resume(s), job preferences, and —
          only if you explicitly consent — voluntary EEO self-identification fields. We never
          store your LinkedIn or Workday passwords.
        </Clause>
        <Clause title="Why we collect it">
          To find roles that match you, tailor your resume to each role, fill applications, and
          let you review and submit them. EEO fields, if provided, are used only to answer an
          employer&apos;s own optional questions and are never used for matching or filtering.
        </Clause>
        <Clause title="Where it is stored">
          Securely in Supabase (Postgres + Storage) with row-level security and signed-URL-only
          file access. Sensitive demographic data is encrypted at rest.
        </Clause>
        <Clause title="Who it is shared with">
          The employers you apply to — on your instruction, and only after you confirm a
          submission. We do not sell your data.
        </Clause>
        <Clause title="Retention and deletion">
          You can request deletion of your account and data at any time. Rendered application
          PDFs are kept only for a hot window and re-rendered on demand thereafter.
        </Clause>
        <Clause title="Your rights (DPDP Act 2023 / GDPR)">
          Access, correction, deletion, and withdrawal of consent. Contact us to exercise any of
          these.
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
