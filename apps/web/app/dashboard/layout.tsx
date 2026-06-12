import type { ReactNode } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar, MobileNav } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started?mode=signin" as Route);
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(60rem_40rem_at_85%_-10%,rgba(47,125,244,0.08),transparent_60%)] bg-panel">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <Topbar email={user.email} />
            <MobileNav />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
