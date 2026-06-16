import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `Cancellation and refund rules for ${SITE_NAME} subscriptions.`,
  robots: { index: true, follow: true },
  alternates: { canonical: "/refund" },
};

const UPDATED_AT = "June 17, 2026";

export default function RefundPage() {
  return (
    <main className="relative min-h-screen bg-white text-ink">
      <Nav />
      <article className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
        <p className="text-sm font-bold text-brand-700">Legal</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-4xl">
          Refund Policy
        </h1>
        <p className="mt-3 text-sm font-semibold text-muted">Last updated: {UPDATED_AT}</p>

        <section className="mt-8 rounded-2xl bg-brand-50 p-5 ring-1 ring-inset ring-brand-100">
          <h2 className="text-base font-extrabold text-ink">Our policy in one sentence</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            You can cancel anytime, and we will review fair refund requests for first purchases,
            recent renewals, duplicate charges, billing errors, and service failures.
          </p>
        </section>

        <Clause title="1. Subscription cancellation">
          You can cancel your subscription at any time from the Creem customer portal link sent after
          purchase, or by emailing{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Cancellation stops future renewal charges. Unless required by law or approved under this
          policy, cancellation does not automatically refund charges already paid.
        </Clause>

        <Clause title="2. First-charge refund window">
          If JobPosted is not the right fit, you may request a refund within 14 calendar days of your
          first paid subscription charge. We may deny or reduce a refund if the account shows heavy
          completed usage, abuse, fraud, or violation of our{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/terms">
            Terms of Service
          </Link>
          .
        </Clause>

        <Clause title="3. Renewal refunds">
          Renewal charges may be refunded if you contact us within 7 calendar days of the renewal and
          there has been no material paid usage after the renewal date. Material usage includes
          preparing, tailoring, filling, or submitting a meaningful batch of applications after the
          renewal.
        </Clause>

        <Clause title="4. Billing errors and duplicate charges">
          Duplicate charges, accidental overcharges, or clear billing mistakes are eligible for a
          refund once verified. Please include the account email, receipt email, order ID if
          available, and a short description of the issue.
        </Clause>

        <Clause title="5. Service failures">
          If a paid account cannot access core paid features because of a JobPosted-side outage or
          account error, contact us. Depending on the issue, we may provide a refund, partial refund,
          account credit, or service extension. This does not cover outages or policy changes caused
          by third-party job boards, applicant tracking systems, browser-session platforms, AI
          providers, or payment providers.
        </Clause>

        <Clause title="6. What is not refundable">
          We do not refund solely because an employer does not respond, an interview or offer is not
          received, an application is rejected, a daily upper limit is not reached, or a user changes
          job-search strategy after substantial service usage. JobPosted does not sell guaranteed job
          outcomes.
        </Clause>

        <Clause title="7. How refunds are processed">
          Payments are processed by Creem, our merchant-of-record/payment provider. If we approve a
          refund, it will be processed through Creem to the original payment method where possible.
          Creem, card networks, banks, and local law may affect refund timing, method, and eligibility.
        </Clause>

        <Clause title="8. Chargebacks and disputes">
          Please contact us first so we can investigate and resolve billing issues quickly. Starting
          a chargeback before contacting support may slow down resolution because the dispute must
          then follow the payment provider and card-network process.
        </Clause>

        <Clause title="9. Your statutory rights">
          This policy does not limit any non-waivable consumer rights that apply in your country or
          region. Where local law gives you stronger refund, cancellation, or withdrawal rights, those
          rights still apply.
        </Clause>

        <Clause title="10. Contact">
          Refund, cancellation, and billing questions can be sent to{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . You can also read our{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/privacy">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/terms">
            Terms of Service
          </Link>
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
