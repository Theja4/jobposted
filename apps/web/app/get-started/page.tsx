import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Create your JobPosted account or sign in to queue tailored applications and confirm every send.",
  robots: { index: false, follow: true },
};

export default function GetStartedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-panel" />}>
      <AuthScreen />
    </Suspense>
  );
}
