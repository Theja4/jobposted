import type {
  ResumeAward,
  ResumeCertification,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
  ResumeLink,
  ResumeProject,
  ResumePublication,
} from "@jobposted/shared";

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
  projects?: unknown;
  certifications?: unknown;
  languages?: unknown;
  awards?: unknown;
  publications?: unknown;
  interests?: unknown;
  references?: unknown;
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
        gpa: str(row.gpa) || undefined,
      };
    })
    .filter((education) => education.school || education.degree);
}

export function projectContent(value: unknown): ResumeProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        name: str(row.name),
        description: str(row.description) || undefined,
        bullets: strArr(row.bullets),
        technologies: strArr(row.technologies),
        url: str(row.url) || undefined,
      };
    })
    .filter((project) => project.name || project.description || (project.bullets?.length ?? 0) > 0);
}

export function certificationContent(value: unknown): ResumeCertification[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        name: str(row.name),
        issuer: str(row.issuer) || undefined,
        date: str(row.date) || undefined,
        url: str(row.url) || undefined,
      };
    })
    .filter((certification) => certification.name || certification.issuer);
}

export function awardContent(value: unknown): ResumeAward[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        title: str(row.title),
        issuer: str(row.issuer) || undefined,
        date: str(row.date) || undefined,
        url: str(row.url) || undefined,
      };
    })
    .filter((award) => award.title || award.issuer);
}

export function publicationContent(value: unknown): ResumePublication[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        title: str(row.title),
        publisher: str(row.publisher) || undefined,
        date: str(row.date) || undefined,
        url: str(row.url) || undefined,
      };
    })
    .filter((publication) => publication.title || publication.publisher);
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
    projects: projectContent(payload.projects),
    certifications: certificationContent(payload.certifications),
    languages: strArr(payload.languages),
    awards: awardContent(payload.awards),
    publications: publicationContent(payload.publications),
    interests: strArr(payload.interests),
    references: strArr(payload.references),
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
