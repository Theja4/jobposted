import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";
import { ProFeatureGate } from "@/components/dashboard/ProFeatureGate";
import {
  defaultOnboardingConfig,
  sanitizeOnboardingConfig,
  type OnboardingConfig,
} from "@/lib/onboarding/model";
import { hasActiveSubscription } from "@/lib/billing/access";
import type { SourceDocument } from "@/lib/profile/resume-version";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Onboarding" };

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strArr = (value: unknown) =>
  Array.isArray(value) ? value.map(str).filter(Boolean) : [];
const money = (value: unknown) => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

function sourceDocumentFrom(value: unknown): SourceDocument | null {
  const row = rec(value);
  const name = str(row.name);
  const storagePath = str(row.storagePath);
  if (!name || !storagePath) return null;
  return {
    name,
    storagePath,
    contentType: str(row.contentType) || "application/octet-stream",
    size: typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0,
    uploadedAt: str(row.uploadedAt) || new Date().toISOString(),
    contentHash: str(row.contentHash) || undefined,
  };
}

function fallbackNameFromPath(path: string) {
  return path ? decodeURIComponent(path.split("/").pop() || "Resume") : null;
}

function authorizedToWorkFromProfile(workAuthorization: string, needsSponsorship: unknown) {
  const normalized = workAuthorization.toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "not-authorized" || normalized === "not-authorised") return false;
  if (normalized && normalized !== "needs-sponsorship" && normalized !== "requires-sponsorship") return true;
  if (typeof needsSponsorship === "boolean" && needsSponsorship === false) return true;
  return null;
}

function applyExistingProfile(
  config: OnboardingConfig,
  args: { profile: unknown; content: unknown; docPath: string; sourceDocument: unknown },
) {
  const row = rec(args.profile);
  const content = rec(args.content);
  const links = rec(content.links);
  const workAuthorization = str(row.work_authorization);
  const sourceDocument =
    sourceDocumentFrom(args.sourceDocument) ||
    sourceDocumentFrom(content.sourceDocument) ||
    config.profile.resumeSource;
  const resumeName = sourceDocument?.name || config.profile.resumeName || fallbackNameFromPath(args.docPath);
  return sanitizeOnboardingConfig({
    ...config,
    profile: {
      ...config.profile,
      basics: {
        ...config.profile.basics,
        fullName: config.profile.basics.fullName || str(row.full_name) || str(content.name),
        email: config.profile.basics.email || str(row.email) || str(content.email),
        phone: config.profile.basics.phone || str(row.phone) || str(content.phone),
        location: config.profile.basics.location || str(row.location) || str(content.location),
        addressLine1:
          config.profile.basics.addressLine1 ||
          str(content.addressLine1) ||
          str(content.street) ||
          str(content.address),
        postalCode:
          config.profile.basics.postalCode ||
          str(content.postalCode) ||
          str(content.postal_code) ||
          str(content.zip),
      },
      links: {
        ...config.profile.links,
        linkedin: config.profile.links.linkedin || str(row.linkedin_url) || str(links.linkedin),
        portfolio: config.profile.links.portfolio || str(row.portfolio_url) || str(links.portfolio),
        github: config.profile.links.github || str(links.github),
      },
      workAuth: {
        ...config.profile.workAuth,
        authorizedToWork:
          config.profile.workAuth.authorizedToWork ??
          authorizedToWorkFromProfile(workAuthorization, row.needs_sponsorship),
        needsSponsorship:
          config.profile.workAuth.needsSponsorship ??
          (typeof row.needs_sponsorship === "boolean" ? row.needs_sponsorship : null),
        relocationOk:
          config.profile.workAuth.relocationOk ??
          (typeof row.relocation_ok === "boolean" ? row.relocation_ok : null),
        currentSalaryMin:
          config.profile.workAuth.currentSalaryMin ??
          money(row.current_salary_min),
        currentSalaryMax:
          config.profile.workAuth.currentSalaryMax ??
          money(row.current_salary_max),
        currentSalaryCurrency:
          str(row.current_salary_currency) ||
          config.profile.workAuth.currentSalaryCurrency ||
          config.profile.workAuth.salaryCurrency,
        salaryMin:
          config.profile.workAuth.salaryMin ??
          money(row.salary_expectation_min),
        salaryMax:
          config.profile.workAuth.salaryMax ??
          money(row.salary_expectation_max),
        salaryCurrency:
          str(row.salary_currency) || config.profile.workAuth.salaryCurrency || config.profile.workAuth.currentSalaryCurrency,
      },
      headline: config.profile.headline || str(content.headline),
      summary: config.profile.summary || str(content.summary),
      skills: config.profile.skills.length > 0 ? config.profile.skills : strArr(content.skills),
      experience:
        config.profile.experience.length > 0 ? config.profile.experience : recArray(content.experience),
      education:
        config.profile.education.length > 0 ? config.profile.education : educationArray(content.education),
      resumeName,
      resumeSource: sourceDocument,
    },
  });
}

function recArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = rec(item);
    return {
      company: str(row.company),
      title: str(row.title),
      location: str(row.location),
      startDate: str(row.startDate),
      endDate: str(row.endDate),
      current: row.current === true,
      bullets: strArr(row.bullets),
    };
  });
}

function educationArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = rec(item);
    return {
      school: str(row.school),
      degree: str(row.degree),
      field: str(row.field),
      startDate: str(row.startDate),
      endDate: str(row.endDate),
      gpa: str(row.gpa),
    };
  });
}

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  if (!user) {
    return <OnboardingWizard initialConfig={defaultOnboardingConfig(email)} />;
  }
  if (!(await hasActiveSubscription(supabase, user.id))) {
    return (
      <ProFeatureGate
        icon={Settings2}
        title="Setup unlocks with Pro"
        description="Setup gives JobPosted the profile, resume, and preferences it needs to prepare applications accurately."
        detail="You can still browse jobs and track roles without upgrading."
      />
    );
  }

  const [{ data: configRow }, { data: profile }] = await Promise.all([
    supabase.from("onboarding_configurations").select("data,completed_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  const activeResumeVersionId = str(rec(profile).active_resume_version_id);
  const [{ data: version }, { data: doc }] = await Promise.all([
    activeResumeVersionId
      ? supabase
          .from("resume_base_versions")
          .select("content,storage_path,source_document,created_at")
          .eq("user_id", user.id)
          .eq("id", activeResumeVersionId)
          .maybeSingle()
      : supabase
          .from("resume_base_versions")
          .select("content,storage_path,source_document,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
    supabase
      .from("documents")
      .select("storage_path,created_at")
      .eq("user_id", user.id)
      .eq("type", "base_resume")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const loaded = sanitizeOnboardingConfig(rec(configRow).data ?? defaultOnboardingConfig(email), email);
  const initial = applyExistingProfile(loaded, {
    profile,
    content: rec(version).content,
    docPath: str(rec(version).storage_path) || str(rec(doc).storage_path),
    sourceDocument: rec(version).source_document,
  });

  return <OnboardingWizard initialConfig={initial} completedAt={str(rec(configRow).completed_at) || null} />;
}
