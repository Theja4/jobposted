import type { ReactNode } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started?mode=signin" as Route);
  }

  return (
    <div className="min-h-svh bg-panel">
      <DashboardNav />
      <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <div className="mx-auto w-full max-w-[88rem]">{children}</div>
      </main>
    </div>
  );
}
