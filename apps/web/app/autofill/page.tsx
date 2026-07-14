import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { AutofillFeature } from "@/components/landing/AutofillFeature";
import { Footer } from "@/components/landing/Footer";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Autofill — one-click job applications",
  description: `${SITE_NAME} Autofill reads any job application, maps it to your profile, and fills the whole form in one click. Works across the top 80 application systems. You review before submitting.`,
  alternates: { canonical: "/autofill" },
};

export default function AutofillPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-white">
      <Nav />
      <AutofillFeature />
      <Footer />
    </main>
  );
}
