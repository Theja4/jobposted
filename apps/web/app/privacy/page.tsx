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

const UPDATED_AT = "July 4, 2026";

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
            <li>
              We use your account, profile, resume, preferences, application answers, and tracker
              activity to run JobPosted.
            </li>
            <li>
              We use AI model providers to parse resumes, score matches, tailor resumes, and map
              application fields.
            </li>
            <li>
              The Chrome extension reads supported job application pages so it can autofill forms,
              assist with answers, tailor documents, and sync your application tracker.
            </li>
            <li>
              We do not sell your personal data, do not store employer-site passwords, and do not
              submit applications without your review or instruction.
            </li>
          </ul>
        </section>

        <Clause title="1. What we collect">
          We collect account details such as your email address, profile details such as your name,
          phone number, address or location, links, education, work history, skills, projects, work
          authorization, job preferences, saved answers, resumes, cover letters, generated drafts,
          application tracker activity, and application history. If you choose to provide compensation
          details or voluntary demographic, EEO, veteran, disability, race, ethnicity, gender, or other
          self-identification answers, we store and use them only as described in this policy.
        </Clause>

        <Clause title="2. Chrome extension data">
          The JobPosted Chrome extension runs in your browser on supported job boards, applicant
          tracking systems, employer career pages, and JobPosted pages. To provide autofill, answer
          assist, resume and cover letter tools, and tracker sync, the extension may read the current
          page URL, host, title, job posting details, visible form labels, field types, required
          status, available options, current field values when needed to avoid overwriting your work,
          section or step names, fill results, and saved or submitted tracker status. The extension
          does not build a general browsing history, does not store LinkedIn, Workday, ATS, or
          employer-site passwords, and does not submit an application unless you choose to do so.
        </Clause>

        <Clause title="3. Extension storage and permissions">
          The extension uses Chrome storage to keep your JobPosted session, extension settings,
          cached profile data, and a short retry queue for tracker sync when the network is
          unavailable. It uses JobPosted authentication cookies or web-app session data only from
          JobPosted-owned domains to connect your signed-in account. It uses scripting and active-tab
          access to scan and fill the page you are using, and alarms to retry failed tracker syncs.
          All extension code is bundled with the extension; model responses and API responses are
          treated as data, not executable remote code.
        </Clause>

        <Clause title="4. Resume, job, and application data">
          JobPosted processes resume files, parsed resume text, profile data, reusable answers,
          tailored resume drafts, cover letter drafts, job descriptions, job URLs, employer and role
          names, match scores, application field labels, field mapping decisions, field fill results,
          resume selections, tracker stages, notes, and application status. This lets you prepare
          applications, keep a record of what was filled, and return to jobs later.
        </Clause>

        <Clause title="5. How we use AI models">
          We use AI and embedding model providers, including OpenAI-compatible providers, Microsoft
          Foundry, OpenRouter, and AI gateway services when configured, to parse resumes, create
          embeddings, score fit, tailor resume wording, draft cover letters, summarize job
          requirements, assist with application answers, and map application fields. We send only the
          information needed for the task, such as resume text, profile details, saved answers, job
          descriptions, page field labels, page options, and relevant application context. We do not
          use optional demographic or EEO data for job matching or ranking. Where provider controls
          are available, we configure them to avoid training on customer content.
        </Clause>

        <Clause title="6. How we use your data">
          We use your data to authenticate you, maintain your account, load your profile in the
          extension, find relevant roles, prepare applications, tailor resumes, draft cover letters,
          fill supported forms, provide answer assistance, sync your application tracker, retry
          failed syncs, provide support, secure the service, prevent abuse, process billing status,
          debug reliability issues, and improve product performance. We may also use aggregated or
          de-identified information to understand product health and feature usage.
        </Clause>

        <Clause title="7. Who we share data with">
          We share data with service providers that help us run JobPosted, including Supabase for
          authentication, database, and storage; hosting and worker providers such as Vercel or
          Railway; AI providers such as Microsoft Foundry and OpenRouter; analytics providers such as
          PostHog; observability providers such as Sentry when configured; email or support tools;
          and payment providers. Payments are processed by Creem, our merchant-of-record/payment
          provider, which receives the billing details needed to process checkout, taxes, invoices,
          subscriptions, refunds, and payment support. We share application information with
          employers or applicant tracking systems only when you instruct JobPosted to prepare, fill,
          upload documents to, or submit an application.
        </Clause>

        <Clause title="8. Chrome Web Store Limited Use">
          For data collected through the Chrome extension, we use and transfer that data only to
          provide or improve JobPosted&apos;s user-facing extension features, including
          authentication, profile loading, autofill, answer assistance, document generation, tracker
          sync, reliability, security, support, and abuse prevention. We do not sell extension user
          data, do not use it for unrelated advertising, and do not use it to determine
          creditworthiness or lending eligibility. Service providers process extension data only for
          these approved purposes or as required by law.
        </Clause>

        <Clause title="9. Storage and security">
          JobPosted stores application data in Supabase Postgres and resume files in Supabase
          Storage. The extension stores session, settings, profile cache, and sync retry data in
          Chrome storage on your device. We use account isolation, row-level security, signed URLs for
          private file access, rate limits, and limited internal access. Voluntary identity answers,
          when provided, are stored with your onboarding configuration and are not used for job
          matching or filtering. No system is perfectly secure, but we work to keep access limited to
          what is needed to operate and support the service.
        </Clause>

        <Clause title="10. Retention and deletion">
          We keep account, profile, billing status, and application history while your account is
          active or as needed for legal, security, tax, dispute, or operational reasons. Some
          generated resume files and temporary artifacts may be cleaned up automatically. Local
          extension data can be cleared by signing out, clearing extension storage, or uninstalling
          the extension. You can request deletion of your account and personal data by emailing{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </Clause>

        <Clause title="11. Your choices and rights">
          You can update profile and resume data in your dashboard. Optional demographic answers can
          be left blank, changed, or withdrawn. You can review application pages before submitting
          them and can edit generated answers or documents. Depending on where you live, you may have
          rights to access, correct, delete, export, or object to processing of your personal data.
          Email us to exercise those rights. We will not discriminate against you for making a valid
          privacy request.
        </Clause>

        <Clause title="12. Cookies, analytics, and product telemetry">
          We use essential cookies and tokens for authentication. We may use privacy-conscious product
          analytics, such as PostHog, to understand page views, sign-up flow health, and feature
          usage. The Chrome extension may use JobPosted auth cookies or web-app session data from
          JobPosted-owned domains to connect your account. Analytics events should not include resume
          files, employer passwords, or full application answers.
        </Clause>

        <Clause title="13. International processing">
          JobPosted and its providers may process data in the United States, India, the European
          Economic Area, or other regions where our service providers operate. We use contractual and
          technical safeguards appropriate to the provider and data type.
        </Clause>

        <Clause title="14. Changes to this policy">
          We may update this Privacy Policy as JobPosted changes. If a change materially affects how
          we use your personal data, we will update this page and, where appropriate, notify users in
          the product or by email.
        </Clause>

        <Clause title="15. Contact">
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
