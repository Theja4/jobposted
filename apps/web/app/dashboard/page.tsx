import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApplicationsChart } from "@/components/dashboard/ApplicationsChart";
import { ApplicationHistory } from "@/components/dashboard/ApplicationHistory";
import { AckBanner } from "@/components/dashboard/AckBanner";
import { getDashboardApplications, getDashboardQueue, getDashboardStats } from "@/lib/dashboard/applications";
import { Send, MessageSquareReply, CalendarCheck, Gauge } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

function statTiles(stats: Awaited<ReturnType<typeof getDashboardStats>>) {
  return [
  {
    label: "Sent this week",
    value: `${stats.sentThisWeek}`,
    hint: "avg 15–20 a day",
    Icon: Send,
    gradient: "linear-gradient(150deg,#2f7df4,#1f50c0)",
    text: "text-white",
    sub: "text-white/70",
  },
  {
    label: "Responses",
    value: `${stats.responses}`,
    hint: "recruiters opened your file",
    Icon: MessageSquareReply,
    gradient: "linear-gradient(150deg,#dff7fb,#9fe4ee)",
    text: "text-[#0a4650]",
    sub: "text-[#0a4650]/65",
  },
  {
    label: "Interviews",
    value: `${stats.interviews}`,
    hint: "scheduled or completed",
    Icon: CalendarCheck,
    gradient: "linear-gradient(150deg,#fff1d6,#ffd98a)",
    text: "text-[#3d2c05]",
    sub: "text-[#3d2c05]/65",
  },
  {
    label: "Avg match quality",
    value: `${stats.avgMatch}%`,
    hint: "only roles worth applying to",
    Icon: Gauge,
    gradient: "linear-gradient(150deg,#eaf1ff,#cfe0ff)",
    text: "text-[#10306b]",
    sub: "text-[#10306b]/65",
  },
  ];
}

function firstName(email?: string) {
  if (!email) return "there";
  const handle = email.split("@")[0]?.split(/[._-]+/)[0];
  if (!handle) return "there";
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [applications, queue, stats] = await Promise.all([
    getDashboardApplications({ limit: 5 }),
    getDashboardQueue(),
    getDashboardStats(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">
          Welcome back, {firstName(user?.email)}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          JobPosted is preparing matched roles for your worker queue.
        </p>
      </div>

      <AckBanner
        acknowledged={queue.acknowledged}
        mode={queue.mode}
        todayCount={queue.today.length}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statTiles(stats).map(({ label, value, hint, Icon, gradient, text, sub }) => (
          <div
            key={label}
            className={`relative overflow-hidden rounded-[1.5rem] p-5 shadow-[0_18px_40px_-22px_rgba(7,26,51,0.45)] ${text}`}
            style={{ background: gradient }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[1.5rem]"
              style={{ background: "linear-gradient(to bottom,rgba(255,255,255,0.25),transparent)" }}
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black tracking-[0.08em] uppercase">{label}</p>
                <Icon className="size-4 opacity-80" />
              </div>
              <p className="mt-3 text-4xl font-extrabold tracking-[-0.04em]">{value}</p>
              <p className={`mt-1 text-xs font-bold ${sub}`}>{hint}</p>
            </div>
          </div>
        ))}
      </div>

      <ApplicationsChart />

      <ApplicationHistory applications={applications} limit={5} />
    </div>
  );
}
