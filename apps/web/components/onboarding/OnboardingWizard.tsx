"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { EMPTY_PREFERENCES, type JobPreferences, type WorkAuthorization } from "@jobposted/shared";
import { Stepper } from "./Stepper";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { TagInput } from "@/components/ui/TagInput";
import { buttonClasses } from "@/components/ui/button";
import { completeOnboarding, type ProfilePayload } from "@/lib/actions/onboarding";

const STEPS = ["Resume", "About you", "Work eligibility", "EEO (optional)", "Preferences"];

const WORK_AUTH: { value: WorkAuthorization; label: string }[] = [
  { value: "citizen", label: "Citizen / permanent resident" },
  { value: "OPT", label: "OPT" },
  { value: "STEM-OPT", label: "STEM-OPT" },
  { value: "H1B", label: "H-1B" },
  { value: "needs_sponsorship", label: "Will need sponsorship" },
  { value: "india_citizen", label: "India citizen" },
];

type Form = ProfilePayload & { eeoConsent: boolean };

const INITIAL: Form = {
  fullName: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  portfolioUrl: "",
  workAuthorization: "",
  needsSponsorship: false,
  relocationOk: false,
  relocationNotes: "",
  salaryExpectationMin: null,
  salaryExpectationMax: null,
  salaryCurrency: "USD",
  noticePeriodDays: null,
  preferences: { ...EMPTY_PREFERENCES },
  eeoConsent: false,
};

export function OnboardingWizard({ email, initialName }: { email: string; initialName?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({ ...INITIAL, fullName: initialName ?? "" });
  const [resume, setResume] = useState<{ name: string; status: "idle" | "up" | "done" | "err" }>({
    name: "",
    status: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setPref = <K extends keyof JobPreferences>(k: K, v: JobPreferences[K]) =>
    setForm((f) => ({ ...f, preferences: { ...f.preferences, [k]: v } }));

  async function onResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResume({ name: file.name, status: "up" });
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/onboarding/resume", { method: "POST", body: fd });
      setResume({ name: file.name, status: res.ok ? "done" : "err" });
    } catch {
      setResume({ name: file.name, status: "err" });
    }
  }

  async function finish() {
    setSubmitting(true);
    setError("");
    const { eeoConsent, ...profile } = form;
    const result = await completeOnboarding(profile, eeoConsent);
    if (result.ok) {
      router.push("/dashboard");
    } else {
      setSubmitting(false);
      setError(result.error ?? "Couldn't save. Try again.");
    }
  }

  const canNext =
    step !== 4 || form.preferences.titles.length > 0; // require at least one target title

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8">
        <Stepper steps={STEPS} current={step} />
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white p-6 sm:p-8">
        {step === 0 && (
          <Step title="Upload your resume" subtitle="We'll tailor it to each role. PDF or DOCX.">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 px-6 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40">
              {resume.status === "done" ? (
                <>
                  <CheckCircle2 className="size-8 text-brand-600" />
                  <span className="text-sm font-medium text-ink">{resume.name}</span>
                  <span className="text-xs text-muted">Uploaded — replace by choosing another</span>
                </>
              ) : resume.status === "up" ? (
                <>
                  <Loader2 className="size-8 animate-spin text-brand-600" />
                  <span className="text-sm text-muted">Uploading {resume.name}…</span>
                </>
              ) : (
                <>
                  <UploadCloud className="size-8 text-zinc-400" />
                  <span className="text-sm font-medium text-ink">Click to upload</span>
                  <span className="text-xs text-muted">PDF or DOCX, up to 6 MB</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.docx,application/pdf"
                className="hidden"
                onChange={onResume}
              />
            </label>
            {resume.status === "err" && (
              <p className="mt-2 text-sm text-red-600">Upload failed — try again.</p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <FileText className="size-3.5" /> Optional — you can add it later in Settings.
            </p>
          </Step>
        )}

        {step === 1 && (
          <Step title="About you" subtitle="The basics every application asks for.">
            <Field label="Full name" htmlFor="ob-name">
              <Input
                id="ob-name"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Email">
              <Input value={email} disabled />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="ob-phone">
                <Input
                  id="ob-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                />
              </Field>
              <Field label="Location" htmlFor="ob-loc">
                <Input
                  id="ob-loc"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="San Francisco, CA"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="LinkedIn URL" htmlFor="ob-li">
                <Input
                  id="ob-li"
                  value={form.linkedinUrl}
                  onChange={(e) => set("linkedinUrl", e.target.value)}
                  placeholder="linkedin.com/in/…"
                />
              </Field>
              <Field label="Portfolio / GitHub" htmlFor="ob-pf">
                <Input
                  id="ob-pf"
                  value={form.portfolioUrl}
                  onChange={(e) => set("portfolioUrl", e.target.value)}
                  placeholder="github.com/…"
                />
              </Field>
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="Work eligibility" subtitle="So we only show roles you can actually take.">
            <Field label="Work authorization" htmlFor="ob-auth">
              <Select
                id="ob-auth"
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Min salary" htmlFor="ob-smin">
                <Input
                  id="ob-smin"
                  type="number"
                  value={form.salaryExpectationMin ?? ""}
                  onChange={(e) =>
                    set("salaryExpectationMin", e.target.value ? Number(e.target.value) : null)
                  }
                  placeholder="120000"
                />
              </Field>
              <Field label="Max salary" htmlFor="ob-smax">
                <Input
                  id="ob-smax"
                  type="number"
                  value={form.salaryExpectationMax ?? ""}
                  onChange={(e) =>
                    set("salaryExpectationMax", e.target.value ? Number(e.target.value) : null)
                  }
                  placeholder="160000"
                />
              </Field>
              <Field label="Currency" htmlFor="ob-cur">
                <Select
                  id="ob-cur"
                  value={form.salaryCurrency}
                  onChange={(e) => set("salaryCurrency", e.target.value)}
                >
                  {["USD", "EUR", "GBP", "INR", "CAD", "AUD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notice period (days)" htmlFor="ob-notice">
              <Input
                id="ob-notice"
                type="number"
                value={form.noticePeriodDays ?? ""}
                onChange={(e) =>
                  set("noticePeriodDays", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="30"
              />
            </Field>
          </Step>
        )}

        {step === 3 && (
          <Step
            title="Equal-opportunity self-ID"
            subtitle="Entirely optional and voluntary."
          >
            <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <p>
                These details are <strong>never used to match or filter jobs</strong>. We only
                record your consent — they&apos;re used solely to answer an employer&apos;s own
                optional EEO questions, and you can skip this entirely.
              </p>
            </div>
            <div className="mt-4">
              <Toggle
                checked={form.eeoConsent}
                onChange={(v) => set("eeoConsent", v)}
                label="I consent to optionally providing EEO self-ID when an employer asks"
              />
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step title="What are you looking for?" subtitle="This drives your matched feed.">
            <Field label="Target job titles" htmlFor="ob-titles" hint="Press Enter or comma to add.">
              <TagInput
                id="ob-titles"
                value={form.preferences.titles}
                onChange={(v) => setPref("titles", v)}
                placeholder="e.g. Backend Engineer, Platform Engineer"
              />
            </Field>
            <Field label="Key skills" htmlFor="ob-skills" hint="Improves match quality.">
              <TagInput
                id="ob-skills"
                value={form.preferences.skills}
                onChange={(v) => setPref("skills", v)}
                placeholder="e.g. Go, Postgres, Kubernetes"
              />
            </Field>
            <Field label="Preferred locations" htmlFor="ob-plocs">
              <TagInput
                id="ob-plocs"
                value={form.preferences.locations}
                onChange={(v) => setPref("locations", v)}
                placeholder="e.g. Remote, New York, London"
              />
            </Field>
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-4">
              <Toggle
                checked={form.preferences.remoteOnly}
                onChange={(v) => setPref("remoteOnly", v)}
                label="Remote roles only"
              />
            </div>
          </Step>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={buttonClasses("ghost", "md", step === 0 ? "invisible" : "")}
          >
            <ArrowLeft className="size-4" /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className={buttonClasses("primary", "md")}
            >
              Continue <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={submitting || !canNext}
              className={buttonClasses("primary", "md")}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Finishing…
                </>
              ) : (
                <>Finish & see my matches</>
              )}
            </button>
          )}
        </div>
        {step === 4 && !canNext && (
          <p className="mt-2 text-right text-xs text-muted">Add at least one target title.</p>
        )}
      </div>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
