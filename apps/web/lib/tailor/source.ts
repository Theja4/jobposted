import {
  emptyResumeContent,
  type ResumeContent,
  type ResumeAward,
  type ResumeCertification,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeLink,
  type ResumeProject,
  type ResumePublication,
} from "@jobposted/shared";

// The server client is scoped to the non-public `jobposted` schema, whose
// generics don't match SupabaseClient's defaults. We only need `.from()` here,
// so type structurally rather than fighting the schema generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaScopedClient = { from: (table: string) => any };

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function experienceFrom(value: unknown): ResumeExperience[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeExperience[] = [];
  for (const item of value) {
    const r = rec(item);
    const title = str(r.title ?? r.role ?? r.position);
    const company = str(r.company ?? r.employer);
    if (!title && !company) continue;
    out.push({
      company,
      title,
      location: str(r.location) || undefined,
      startDate: str(r.startDate ?? r.start_date ?? r.from) || undefined,
      endDate: str(r.endDate ?? r.end_date ?? r.to) || undefined,
      current: typeof r.current === "boolean" ? r.current : undefined,
      bullets: strArr(r.bullets ?? r.highlights ?? r.achievements),
    });
  }
  return out;
}

function educationFrom(value: unknown): ResumeEducation[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeEducation[] = [];
  for (const item of value) {
    const r = rec(item);
    const school = str(r.school ?? r.institution ?? r.name);
    if (!school) continue;
    out.push({
      school,
      degree: str(r.degree) || undefined,
      field: str(r.field ?? r.major) || undefined,
      startDate: str(r.startDate ?? r.start_date) || undefined,
      endDate: str(r.endDate ?? r.end_date) || undefined,
    });
  }
  return out;
}

function projectsFrom(value: unknown): ResumeProject[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeProject[] = [];
  for (const item of value) {
    const r = rec(item);
    const name = str(r.name);
    const description = str(r.description);
    const bullets = strArr(r.bullets);
    const technologies = strArr(r.technologies);
    if (!name && !description && bullets.length === 0) continue;
    out.push({
      name,
      description: description || undefined,
      bullets,
      technologies,
      url: str(r.url) || undefined,
    });
  }
  return out;
}

function certificationsFrom(value: unknown): ResumeCertification[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = rec(item);
      return {
        name: str(r.name),
        issuer: str(r.issuer) || undefined,
        date: str(r.date) || undefined,
        url: str(r.url) || undefined,
      };
    })
    .filter((item) => item.name || item.issuer);
}

function awardsFrom(value: unknown): ResumeAward[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = rec(item);
      return {
        title: str(r.title),
        issuer: str(r.issuer) || undefined,
        date: str(r.date) || undefined,
        url: str(r.url) || undefined,
      };
    })
    .filter((item) => item.title || item.issuer);
}

function publicationsFrom(value: unknown): ResumePublication[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = rec(item);
      return {
        title: str(r.title),
        publisher: str(r.publisher) || undefined,
        date: str(r.date) || undefined,
        url: str(r.url) || undefined,
      };
    })
    .filter((item) => item.title || item.publisher);
}

function linksFrom(profileRow: Rec, content: Rec): ResumeLink[] {
  const links = rec(content.links);
  const candidates: ResumeLink[] = [
    { label: "LinkedIn", url: str(profileRow.linkedin_url) || str(links.linkedin) },
    { label: "Portfolio", url: str(profileRow.portfolio_url) || str(links.portfolio) },
    { label: "GitHub", url: str(links.github) },
    ...strArr(links.website).map((url) => ({ label: "Website", url })),
  ];
  return candidates.filter((l) => l.url);
}

/**
 * Assemble JobPosted's ResumeContent from the user's profile row + a base resume
 * version. When `baseVersionId` is provided, that exact version is used so queued
 * applications keep their pinned resume history.
 */
export async function loadBaseResume(
  supabase: SchemaScopedClient,
  userId: string,
  baseVersionId?: string | null,
): Promise<ResumeContent | null> {
  const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const activeResumeVersionId =
    typeof (profileRow as Record<string, unknown> | null)?.active_resume_version_id === "string"
      ? ((profileRow as Record<string, unknown>).active_resume_version_id as string)
      : "";
  const versionId = baseVersionId || activeResumeVersionId;
  const versionQuery = versionId
    ? supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", userId)
        .eq("id", versionId)
        .maybeSingle()
    : null;
  const { data: baseVersion } =
    (versionQuery ? await versionQuery : { data: null }) ??
    ({ data: null } as { data: unknown });
  let resolvedBaseVersion = baseVersion;
  if (!resolvedBaseVersion && !baseVersionId) {
    resolvedBaseVersion = (
      await supabase
        .from("resume_base_versions")
        .select("content,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;
  }

  const row = rec(profileRow);
  const content = rec((resolvedBaseVersion as Rec | null)?.content);
  const experience = experienceFrom(content.experience ?? content.workExperience);
  const skills = strArr(content.skills);
  const summary = str(content.summary);
  const headline = str(content.headline ?? content.currentRole ?? content.title);
  const projects = projectsFrom(content.projects);
  const certifications = certificationsFrom(content.certifications);
  const languages = strArr(content.languages);
  const awards = awardsFrom(content.awards);
  const publications = publicationsFrom(content.publications);

  if (
    !summary &&
    !headline &&
    experience.length === 0 &&
    skills.length === 0 &&
    projects.length === 0 &&
    certifications.length === 0
  ) {
    return null;
  }

  return {
    ...emptyResumeContent(),
    name: str(row.full_name) || str(content.name),
    headline,
    summary,
    email: str(row.email),
    phone: str(row.phone),
    location: str(row.location) || str(content.location),
    links: linksFrom(row, content),
    experience,
    education: educationFrom(content.education),
    skills,
    projects,
    certifications,
    languages,
    awards,
    publications,
    interests: strArr(content.interests),
    references: strArr(content.references),
  };
}
