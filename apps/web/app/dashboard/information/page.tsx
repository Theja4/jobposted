import type { Metadata } from "next";
import { MASTER_PROFILE } from "@/lib/dashboard/sample-data";
import { Pencil, Mail, Phone, MapPin, Link2, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "My information" };

function Card({
  title,
  children,
  action = true,
}: {
  title: string;
  children: React.ReactNode;
  action?: boolean;
}) {
  return (
    <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
        {action && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors hover:bg-brand-50"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export default function InformationPage() {
  const p = MASTER_PROFILE;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">My information</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          Your master profile — this is the data the copilot uses to auto-fill applications and
          tailor each resume.
        </p>
      </div>

      <Card title="Basic details">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] text-xl font-black text-white">
            {p.fullName.slice(0, 1)}
          </span>
          <div>
            <p className="text-lg font-extrabold text-ink">{p.fullName}</p>
            <p className="text-sm font-semibold text-muted">{p.headline}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail Icon={Mail} label="Email" value={p.email} />
          <Detail Icon={Phone} label="Phone" value={p.phone} />
          <Detail Icon={MapPin} label="Location" value={p.location} />
          {p.links.map((l) => (
            <Detail key={l.label} Icon={Link2} label={l.label} value={l.value} />
          ))}
        </dl>
      </Card>

      <Card title="Professional summary">
        <p className="text-sm leading-7 text-ink/80">{p.summary}</p>
      </Card>

      <Card title="Experience">
        <div className="space-y-5">
          {p.experience.map((job) => (
            <div key={`${job.company}-${job.period}`} className="border-l-2 border-brand-100 pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-extrabold text-ink">
                  {job.role} · <span className="text-brand-700">{job.company}</span>
                </p>
                <p className="text-xs font-bold text-muted">{job.period}</p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {job.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm leading-6 text-ink/75">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Education">
          {p.education.map((e) => (
            <div key={e.school} className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-extrabold text-ink">
                {e.degree} · <span className="text-brand-700">{e.school}</span>
              </p>
              <p className="text-xs font-bold text-muted">{e.period}</p>
            </div>
          ))}
        </Card>

        <Card title="Skills">
          <div className="flex flex-wrap gap-2">
            {p.skills.map((s) => (
              <span
                key={s}
                className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-inset ring-white"
              >
                {s}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-100">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <p className="text-sm leading-6 text-ink/75">
          Keeping this current means sharper auto-fills and higher match scores. Editing is coming
          soon — for now this mirrors your Rezoomed master profile.
        </p>
      </div>
    </div>
  );
}

function Detail({
  Icon,
  label,
  value,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white">
      <Icon className="size-4 shrink-0 text-brand-600" />
      <div className="min-w-0">
        <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="truncate text-sm font-bold text-ink">{value}</dd>
      </div>
    </div>
  );
}
