export interface ExperienceItem {
  company: string
  title: string
  location: string
  startDate: string
  endDate: string
  bullets: string[]
  bulletVisibility?: boolean[]
  summary?: string
  url?: string
}

export interface EducationItem {
  institution: string
  degree: string
  field: string
  startDate?: string
  endDate?: string
  graduationDate?: string
  gpa: string
  url?: string
}

export interface SkillSection {
  title: string
  tag?: string
  skills: string[]
}

export interface CertificationItem {
  name: string
  issuer: string
  date: string
  url?: string
}

export interface ProjectItem {
  name: string
  description: string
  bullets?: string[]
  technologies: string[]
  url?: string
}

export interface AwardItem {
  title: string
  issuer: string
  date: string
  url?: string
}

export interface PublicationItem {
  title: string
  publisher: string
  date: string
  url?: string
}

export type CustomSectionType = 'text' | 'tags' | 'complex' | 'pageBreak'

export interface CustomSection {
  id: string
  title: string
  type: CustomSectionType
  text?: string
  tags?: string[]
  items?: ExperienceItem[]
}

export interface ResumeData {
  name: string
  email: string
  phone: string
  location: string
  linkedin: string
  website: string
  summary: string
  currentRole: string
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: string[]
  skillSections?: SkillSection[]
  certifications: CertificationItem[]
  projects: ProjectItem[]
  languages: string[]
  volunteer: ExperienceItem[]
  interests: string[]
  awards: AwardItem[]
  publications: PublicationItem[]
  references: string[]
  customSections?: CustomSection[]
}
