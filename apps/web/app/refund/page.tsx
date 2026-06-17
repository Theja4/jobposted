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
            You can cancel anytime, and refund requests are only considered within 48 hours after
            your first paid subscription payment; accidental charges are not refundable.
          </p>
        </section>

        <Clause title="1. Subscription cancellation">
          You can cancel your subscription at any time from Billing and support in your account, from
          the Creem customer portal link sent after purchase, or by emailing{" "}
          <a className="font-bold text-brand-700 hover:text-brand-800" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Cancellation stops future renewal charges. Unless required by law or approved under this
          policy, cancellation does not automatically refund charges already paid.
        </Clause>

        <Clause title="2. First-payment refund window">
          If JobPosted is not the right fit, you may request a refund within 48 hours after your
          first paid subscription payment. This first-payment window applies once per user, account,
          or customer. We may deny or reduce a refund if the account shows heavy completed usage,
          abuse, fraud, or violation of our{" "}
          <Link className="font-bold text-brand-700 hover:text-brand-800" href="/terms">
            Terms of Service
          </Link>
          .
        </Clause>

        <Clause title="3. Renewals and accidental charges">
          Renewal charges, accidental purchases, accidental renewals, forgetting to cancel, unused
          time, or changes in your job-search plans are not refundable unless required by law.
        </Clause>

        <Clause title="4. Payment processing errors">
          If you believe a payment processor or card-network error created an incorrect duplicate
          charge, contact us so we can investigate with Creem. Please include the account email,
          receipt email, order ID if available, and a short description of the issue. This does not
          include accidental purchases or renewal charges.
        </Clause>

        <Clause title="5. Service failures">
          If a paid account cannot access core paid features because of a JobPosted-side outage or
          account error, contact us. Depending on the issue, we may provide a refund, partial refund,
          account credit, or service extension. This does not cover outages or policy changes caused
          by third-party career sites, applicant tracking systems, browser-session platforms, AI
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
