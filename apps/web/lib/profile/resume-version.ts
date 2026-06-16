import type { ResumeContent, ResumeEducation, ResumeExperience, ResumeLink } from "@jobposted/shared";

export type Rec = Record<string, unknown>;

export type SourceDocument = {
  name: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  contentHash?: string;
};

export type ProfilePayload = {
  basics?: Rec;
  links?: Rec;
  workAuth?: Rec;
  headline?: unknown;
  summary?: unknown;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
};

export type ResumeVersionContent = Partial<ResumeContent> & {
  sourceDocument?: SourceDocument;
};

export const rec = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};

export const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const strArr = (value: unknown) =>
  Array.isArray(value) ? value.map(str).filter(Boolean) : [];

export const bool = (value: unknown) => (typeof value === "boolean" ? value : null);

export const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function experienceContent(value: unknown): ResumeExperience[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        company: str(row.company),
        title: str(row.title),
        location: str(row.location) || undefined,
        startDate: str(row.startDate) || undefined,
        endDate: str(row.endDate) || undefined,
        current: bool(row.current) ?? false,
        bullets: strArr(row.bullets),
      };
    })
    .filter((experience) => experience.company || experience.title || experience.bullets.length > 0);
}

export function educationContent(value: unknown): ResumeEducation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        school: str(row.school),
        degree: str(row.degree) || undefined,
        field: str(row.field) || undefined,
        startDate: str(row.startDate) || undefined,
        endDate: str(row.endDate) || undefined,
      };
    })
    .filter((education) => education.school || education.degree);
}

function link(label: string, url: string): ResumeLink | null {
  return url ? { label, url } : null;
}

export function resumeContentFromProfilePayload(
  payload: ProfilePayload,
  sourceDocument?: SourceDocument,
): ResumeVersionContent {
  const basics = rec(payload.basics);
  const links = rec(payload.links);
  const content: ResumeVersionContent = {
    name: str(basics.fullName),
    headline: str(payload.headline),
    summary: str(payload.summary),
    email: str(basics.email),
    phone: str(basics.phone),
    location: str(basics.location),
    links: [
      link("LinkedIn", str(links.linkedin)),
      link("Portfolio", str(links.portfolio)),
      link("GitHub", str(links.github)),
    ].filter(Boolean) as ResumeLink[],
    skills: strArr(payload.skills),
    experience: experienceContent(payload.experience),
    education: educationContent(payload.education),
  };
  if (sourceDocument) content.sourceDocument = sourceDocument;
  return content;
}

export function mergeResumeSourceDocument(
  current: unknown,
  sourceDocument: SourceDocument,
): ResumeVersionContent {
  return {
    ...rec(current),
    sourceDocument,
  } as ResumeVersionContent;
}
