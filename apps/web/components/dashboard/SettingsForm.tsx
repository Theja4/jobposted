"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { JobPreferences, WorkAuthorization } from "@jobposted/shared";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { TagInput } from "@/components/ui/TagInput";
import { buttonClasses } from "@/components/ui/button";
import { updateProfile, type ProfilePayload } from "@/lib/actions/onboarding";

const WORK_AUTH: { value: WorkAuthorization; label: string }[] = [
  { value: "citizen", label: "Citizen / permanent resident" },
  { value: "OPT", label: "OPT" },
  { value: "STEM-OPT", label: "STEM-OPT" },
  { value: "H1B", label: "H-1B" },
  { value: "needs_sponsorship", label: "Will need sponsorship" },
  { value: "india_citizen", label: "India citizen" },
];

export function SettingsForm({ initial, email }: { initial: ProfilePayload; email: string }) {
  const [form, setForm] = useState<ProfilePayload>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const set = <K extends keyof ProfilePayload>(k: K, v: ProfilePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setPref = <K extends keyof JobPreferences>(k: K, v: JobPreferences[K]) =>
    setForm((f) => ({ ...f, preferences: { ...f.preferences, [k]: v } }));

  async function save() {
    setStatus("saving");
    setError("");
    const res = await updateProfile(form);
    if (res.ok) {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      setStatus("error");
      setError(res.error ?? "Couldn't save.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="About you">
        <Field label="Full name">
          <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={email} disabled />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="LinkedIn">
            <Input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
          </Field>
          <Field label="Portfolio / GitHub">
            <Input value={form.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Work eligibility">
        <Field label="Work authorization">
          <Select
            value={form.workAuthorization}
            onChange={(e) => set("workAuthorization", e.target.value as WorkAuthorization)}
          >
            <option value="">Select…</option>
            {WORK_AUTH.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
          <Toggle
            checked={form.needsSponsorship}
            onChange={(v) => set("needsSponsorship", v)}
            label="I need visa sponsorship"
          />
          <Toggle
            checked={form.relocationOk}
            onChange={(v) => set("relocationOk", v)}
            label="I'm open to relocation"
          />
        </div>
      </Card>

      <Card title="Matching preferences">
        <Field label="Target job titles" hint="Press Enter or comma to add.">
          <TagInput value={form.preferences.titles} onChange={(v) => setPref("titles", v)} />
        </Field>
        <Field label="Key skills">
          <TagInput value={form.preferences.skills} onChange={(v) => setPref("skills", v)} />
        </Field>
        <Field label="Preferred locations">
          <TagInput value={form.preferences.locations} onChange={(v) => setPref("locations", v)} />
        </Field>
        <Field label="Excluded companies" hint="Roles from these are hidden.">
          <TagInput
            value={form.preferences.excludeCompanies}
            onChange={(v) => setPref("excludeCompanies", v)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum salary">
            <Input
              type="number"
              value={form.preferences.minSalary ?? ""}
              onChange={(e) => setPref("minSalary", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <div className="flex items-end">
            <div className="flex h-11 items-center rounded-xl bg-zinc-50 px-4">
              <Toggle
                checked={form.preferences.remoteOnly}
                onChange={(v) => setPref("remoteOnly", v)}
                label="Remote only"
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={status === "saving"} className={buttonClasses("primary", "md")}>
          {status === "saving" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : status === "saved" ? (
            <>
              <Check className="size-4" /> Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-6">
      <h2 className="mb-4 font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
