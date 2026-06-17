import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, stores, shares, and lets you delete your data.`,
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

const UPDATED_AT = "June 17, 2026";

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen bg-white text-ink">
      <Nav />
      <article className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
        <p className="text-sm font-bold text-brand-700">Legal</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm font-semibold text-muted">Last updated: {UPDATED_AT}</p>

        <section className="mt-8 rounded-2xl bg-brand-50 p-5 ring-1 ring-inset ring-brand-100">
          <h2 className="text-base font-extrabold text-ink">Plain-language summary</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
            <li>We use your profile, resume, preferences, and job activity to run JobPosted.</li>
            <li>
              We use AI model providers to parse resumes, score matches, tailor resumes, and map
              application fields.
            </li>
            <li>
              We do not sell your personal data, and we do not store LinkedIn, Workday, or other
              employer-site passwords.
            </li>
          </ul>
        </section>

        <Clause title="1. What we collect">
          We collect account details such as your email address, profile details such as your name,
          contact information, location, work authorization, job preferences, resumes, cover letters,
          application answers, job tracker activity, and application history. If you choose to provide
          voluntary demographic or EEO self-identification answers, we store them separately and use
          them only as described below.
        </Clause>

        <Clause title="2. Resume, job, and application data">
          JobPosted processes resume files, parsed resume text, tailored resume drafts, job
          descriptions, match scores, form-field labels, field-fill results, and application status.
          The browser extension may send page metadata and field context to JobPosted so we can map
          fields and sync your tracker. The extension does not need or store your employer-site
          passwords.
        </Clause>

        <Clause title="3. How we use AI models">
          We use AI and embedding model providers, including OpenAI-compatible providers and AI
          gateway services, to parse resumes, create embeddings, score fit, tailor resume wording,
          summarize job requirements, and map application fields. We send the information needed for
          the task, such as resume text, profile details, job descriptions, and field labels. We do
          not use optional demographic or EEO data for job matching or ranking. Where provider
          controls are available, we configure them to avoid training on customer content.
        </Clause>

        <Clause title="4. How we use your data">
          We use your data to authenticate you, maintain your account, find relevant roles, prepare
          applications, tailor resumes, fill supported forms, sync your application tracker, provide
          support, secure the service, process billing status, and improve reliability. We may also
          use aggregated or de-identified information to understand product performance.
        </Clause>

        <Clause title="5. Who we share data with">
          We share data with service providers that help us run JobPosted, including hosting,
          database, storage, analytics, AI model, email/support, and payment providers. Payments are
          processed by Creem, our merchant-of-record/payment provider, which receives the billing
          details needed to process checkout, taxes, invoices, subscriptions, refunds, and payment
          support. We share application information with employers or applicant tracking systems only
          when you instruct JobPosted to prepare, fill, or submit an application.
        </Clause>

        <Clause title="6. Storage and security">
          JobPosted stores application data in Supabase Postgres and resume files in Supabase
          Storage. We use account isolation, row-level security, signed URLs for private file access,
          and limited internal access. Voluntary identity answers, when provided, are stored with
          your onboarding configuration and are not used for job matching or filtering. No system is
          perfectly secure, but we work to keep access limited to what is needed to operate and
          support the service.
        </Clause>

        <Clause title="7. Retention and deletion">
          We keep account, profile, billing status, and application history while your account is
          active or as needed for legal, security, tax, dispute, or operational reasons. Some generated
          resume files are temporary and may be cleaned up automatically. You can request deletion of
          your account and personal data by emailing{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </Clause>

        <Clause title="8. Your choices and rights">
          You can update profile and resume data in your dashboard. Optional demographic answers can
          be left blank or withdrawn. Depending on where you live, you may have rights to access,
          correct, delete, export, or object to processing of your personal data. Email us to exercise
          those rights. We will not discriminate against you for making a valid privacy request.
        </Clause>

        <Clause title="9. Cookies, analytics, and product telemetry">
          We use essential cookies and tokens for authentication. We may use privacy-conscious product
          analytics, such as PostHog, to understand page views, sign-up flow health, and feature
          usage. Analytics events should not include resume files, employer passwords, or full
          application answers.
        </Clause>

        <Clause title="10. International processing">
          JobPosted and its providers may process data in the United States, India, the European
          Economic Area, or other regions where our service providers operate. We use contractual and
          technical safeguards appropriate to the provider and data type.
        </Clause>

        <Clause title="11. Changes to this policy">
          We may update this Privacy Policy as JobPosted changes. If a change materially affects how
          we use your personal data, we will update this page and, where appropriate, notify users in
          the product or by email.
        </Clause>

        <Clause title="12. Contact">
          Questions about privacy, security, or data deletion can be sent to{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . You can also review our{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/terms">
            Terms of Service
          </Link>{" "}
          and{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href="/refund">
            Refund Policy
          </a>
          .
        </Clause>
      </article>
      <Footer />
    </main>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 border-t border-zinc-100 pt-7">
      <h2 className="text-lg font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-2 text-pretty text-sm leading-7 text-muted sm:text-base">{children}</p>
    </section>
  );
}
