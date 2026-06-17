import type { Metadata } from "next";
import { headers } from "next/headers";
import { Nav } from "@/components/landing/Nav";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { getPricingViewForCountry } from "@/lib/billing/pricing";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Choose monthly or quarterly ${SITE_NAME} billing with regional pricing support.`,
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const requestHeaders = await headers();
  const pricing = getPricingViewForCountry(requestHeaders.get("x-vercel-ip-country"));

  return (
    <main className="relative min-h-screen overflow-x-clip bg-white">
      <Nav />
      <Pricing pricing={pricing} />
      <Footer />
    </main>
  );
}
