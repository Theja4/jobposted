import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Setup" };

export default function DashboardSetupPage() {
  redirect("/dashboard/onboarding");
}
