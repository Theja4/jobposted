import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Choose a ${SITE_NAME} plan for tailored applications with daily caps, browser-session support, and pause-anytime billing.`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-white">
      <Nav />
      <Pricing />
      <Footer />
    </main>
  );
}
