import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${SITE_NAME}.`,
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
};

const UPDATED_AT = "June 17, 2026";

export default function TermsPage() {
  return (
    <main className="relative min-h-screen bg-white text-ink">
      <Nav />
      <article className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
        <p className="text-sm font-bold text-brand-700">Legal</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm font-semibold text-muted">Last updated: {UPDATED_AT}</p>

        <section className="mt-8 rounded-2xl bg-brand-50 p-5 ring-1 ring-inset ring-brand-100">
          <h2 className="text-base font-extrabold text-ink">Short version</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            JobPosted is a job-application copilot. We help find roles, tailor resumes, prepare
            applications, and keep a tracker. You are responsible for reviewing your information and
            deciding what gets submitted.
          </p>
        </section>

        <Clause title="1. Acceptance">
          These Terms govern your access to and use of {SITE_NAME}. By creating an account, using the
          website, using the browser extension, or buying a paid plan, you agree to these Terms, our{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/privacy">
            Privacy Policy
          </Link>
          , and our{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href="/refund">
            Refund Policy
          </a>
          .
        </Clause>

        <Clause title="2. Eligibility and account security">
          You must be old enough to form a binding contract in your jurisdiction and use JobPosted
          only for your own genuine job search. You are responsible for your account, the accuracy of
          the information you provide, and activity that happens under your account.
        </Clause>

        <Clause title="3. What JobPosted does">
          JobPosted helps match jobs to your profile, tailor resumes, prepare application forms, and
          track application status. Some supported open ATS flows may be prepared server-side after
          your explicit confirmation. Login-gated platforms such as LinkedIn or Workday run in your
          own browser session through the extension; JobPosted does not ask for or store those
          passwords. When a form requires a resume or cover-letter upload, you are responsible for
          checking the file before submission.
        </Clause>

        <Clause title="4. Review before submitting">
          JobPosted uses automation and AI, and outputs can be incomplete, outdated, or wrong. You
          must review each resume, answer, field fill, application, and employer requirement before
          submitting. You are responsible for the final content sent to an employer or applicant
          tracking system.
        </Clause>

        <Clause title="5. AI-generated content">
          JobPosted may use AI models to parse resumes, tailor wording, score job fit, summarize job
          descriptions, and map form fields. AI output is a draft, not professional, legal, career,
          immigration, tax, or hiring advice. We do not guarantee that tailored resumes will improve
          interview rates or that any application will be accepted.
        </Clause>

        <Clause title="6. Your content and permissions">
          You keep ownership of your resume, profile, application answers, and other content you add
          to JobPosted. You give us permission to host, process, transform, transmit, and display that
          content as needed to provide, secure, support, and improve the service.
        </Clause>

        <Clause title="7. Acceptable use">
          Do not use JobPosted to submit false or misleading information, impersonate anyone, abuse
          employer systems, scrape prohibited data, bypass security controls, infringe third-party
          rights, upload malware, or use the service for any unlawful, deceptive, spammy, or
          high-risk activity. We may suspend or terminate access if we believe your use creates risk
          for users, employers, JobPosted, or our providers.
        </Clause>

        <Clause title="8. Third-party services">
          JobPosted depends on third-party services, including applicant tracking systems, career sites,
          Rezoomed, Supabase, AI model providers, analytics providers, and payment providers. We do
          not control third-party websites or employer decisions, and their terms and availability may
          affect what JobPosted can do.
        </Clause>

        <Clause title="9. Billing, taxes, and subscriptions">
          Prices and plan limits are shown on the pricing page before checkout. Paid plans renew
          until canceled unless checkout states otherwise. Creem processes payments as our
          merchant-of-record/payment provider and may calculate taxes, issue receipts or invoices,
          manage the customer portal, and process refunds. You are responsible for providing accurate
          billing and tax information at checkout.
        </Clause>

        <Clause title="10. Cancellation and refunds">
          You can cancel a subscription from Billing and support in your account, from the Creem
          customer portal link sent after purchase, or by contacting{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Cancellation stops future renewal charges but does not automatically refund past charges.
          Refund eligibility is described in our{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href="/refund">
            Refund Policy
          </a>
          .
        </Clause>

        <Clause title="11. No guarantee of job outcomes">
          We do not guarantee interviews, offers, employer responses, application volume, exact daily
          usage, application acceptance, or uninterrupted compatibility with every job site. Daily
          limits are upper bounds and depend on relevant roles, user settings, provider availability,
          and supported application flows.
        </Clause>

        <Clause title="12. Service changes and availability">
          We may change, pause, remove, or limit features as we improve JobPosted or respond to
          third-party changes, security needs, legal requirements, provider limits, or operational
          constraints. We work to keep JobPosted reliable, but the service may occasionally be
          unavailable.
        </Clause>

        <Clause title="13. Limitation of liability">
          To the maximum extent permitted by law, JobPosted is provided "as is" and "as available."
          We are not liable for indirect, incidental, consequential, special, punitive, or lost-profit
          damages, or for employer decisions, third-party outages, application-site changes, or
          content you submit after review.
        </Clause>

        <Clause title="14. Contact">
          Questions about these Terms can be sent to{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
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
