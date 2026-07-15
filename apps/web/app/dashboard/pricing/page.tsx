import type { Metadata } from "next";
import { headers } from "next/headers";
import { Pricing } from "@/components/landing/Pricing";
import { getPricingViewForCountry } from "@/lib/billing/pricing";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Upgrade to Pro",
  description: `Choose monthly or quarterly ${SITE_NAME} billing from your dashboard.`,
};

export default async function DashboardPricingPage() {
  const requestHeaders = await headers();
  const pricing = getPricingViewForCountry(requestHeaders.get("x-vercel-ip-country"));

  return (
    <div className="-mx-4 -my-4 bg-white sm:-mx-6 lg:-mx-8 lg:-my-5">
      <Pricing pricing={pricing} authNextPath="/dashboard/pricing" />
    </div>
  );
}
