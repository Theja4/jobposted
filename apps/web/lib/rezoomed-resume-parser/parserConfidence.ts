import type { ResumeData } from './types'
import { getEducationDateLabel, getProjectBullets, getResumeSkills } from './resume-data'

type ParseSource = 'marker' | 'fast' | 'client' | 'repair'

export interface ResumeParseConfidence {
  score: number
  level: 'high' | 'medium' | 'low'
  issues: string[]
}

export interface ResumeParseCandidate {
  data: ResumeData
  source: ParseSource
  confidence: ResumeParseConfidence
}

export interface ResumeParseConfidenceContext {
  sourceText?: string | null
  sourceTextLength?: number | null
}

// Multi-word terms are unambiguous section headings — match anywhere
const UNAMBIGUOUS_HEADING_TERMS = [
  'work experience',
  'professional experience',
  'employment history',
  'work history',
  'educational background',
  'academic background',
  'academic qualifications',
  'technical skills',
  'core skills',
]

// Single-word terms can appear naturally in prose (e.g. "My interests include...")
// Only match when they look like leaked headings: followed by colon/newline or at line start
const AMBIGUOUS_HEADING_TERMS = [
  'experience',
  'education',
  'academia',
  'academics',
  'qualification',
  'qualifications',
  'skills',
  'competencies',
  'projects',
  'certifications',
  'languages',
  'volunteer',
  'interests',
  'awards',
  'publications',
  'references',
]

// Unambiguous terms: plain word boundary match
const UNAMBIGUOUS_LEAK_RE = new RegExp(
  `\\b(?:${UNAMBIGUOUS_HEADING_TERMS.map(escapeForRegex).join('|')})\\b`, 'i'
)
// Ambiguous terms: require heading-like context (start of string, after newline, or followed by colon)
const AMBIGUOUS_LEAK_RE = new RegExp(
  `(?:^|\\n)\\s*(?:${AMBIGUOUS_HEADING_TERMS.map(escapeForRegex).join('|')})\\s*(?::|\\n|$)`, 'im'
)
// Combined check used in assessSummary
const SUMMARY_LEAK_RE = {
  test(text: string): boolean {
    return UNAMBIGUOUS_LEAK_RE.test(text) || AMBIGUOUS_LEAK_RE.test(text)
  },
  exec(text: string): RegExpExecArray | null {
    return UNAMBIGUOUS_LEAK_RE.exec(text) || AMBIGUOUS_LEAK_RE.exec(text)
  },
}
const DATE_CLUSTER_RE = /\b(?:\d{1,2}\/\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}\s*[-–—]\s*(?:\d{4}|present|current|now))\b/gi

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueIssueList(issues: string[]): string[] {
  return Array.from(new Set(issues))
}

function sourceWeight(source: ParseSource): number {
  if (source === 'marker') return 4
  if (source === 'repair') return 3
  if (source === 'fast') return 2
  return 1
}

function assessSummary(summary: string, issues: string[]): number {
  const trimmed = summary.trim()
  if (!trimmed) {
    issues.push('missing summary')
    return 0
  }

  let score = 10
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const hasHeadingLeak = SUMMARY_LEAK_RE.test(trimmed)
  const dateHits = trimmed.match(DATE_CLUSTER_RE) ?? []

  if (wordCount < 12) {
    score -= 3
    issues.push('summary too short')
  } else if (wordCount > 120) {
    score -= 5
    issues.push('summary too long')
  }

  if (hasHeadingLeak) {
    score -= 6
    issues.push('summary contains downstream section content')
  }

  if (dateHits.length >= 2) {
    score -= 4
    issues.push('summary contains multiple date fragments')
  }

  return Math.max(0, score)
}

function assessExperience(data: ResumeData, issues: string[]): number {
  // Consider volunteer entries as experience for candidates who rely on them
  const allExperience = [
    ...data.experience,
    ...(data.volunteer ?? []),
  ]
  if (allExperience.length === 0) {
    issues.push('missing experience section')
    return 0
  }

  let score = 16
  const completeEntries = allExperience.filter(item => item.title && item.company)
  const bulletEntries = allExperience.filter(item => item.bullets.length > 0)
  const datedEntries = allExperience.filter(item => item.startDate || item.endDate)

  if (completeEntries.length === 0) {
    score -= 8
    issues.push('experience entries missing title or company')
  } else if (completeEntries.length < allExperience.length) {
    score -= 4
    issues.push('some experience entries incomplete')
  }

  if (bulletEntries.length === 0) {
    score -= 6
    issues.push('experience bullets missing')
  } else if (bulletEntries.length < allExperience.length) {
    score -= 3
    issues.push('some experience bullets missing')
  }

  if (datedEntries.length === 0) {
    score -= 4
    issues.push('experience dates missing')
  }

  return Math.max(0, score)
}

function assessEducation(data: ResumeData, issues: string[]): number {
  if (data.education.length === 0) {
    issues.push('missing education section')
    return 0
  }

  let score = 12
  const completeEntries = data.education.filter(item => item.institution || item.degree)
  if (completeEntries.length < data.education.length) {
    score -= 4
    issues.push('some education entries incomplete')
  }
  if (!data.education.some(item => getEducationDateLabel(item))) {
    score -= 2
  }

  return Math.max(0, score)
}

function assessSkills(data: ResumeData, issues: string[]): number {
  const skills = getResumeSkills(data)
  if (skills.length === 0) {
    issues.push('missing skills section')
    return 0
  }

  if (skills.length >= 6) return 10
  if (skills.length >= 3) return 7

  issues.push('skills section sparse')
  return 4
}

function looksLikeProjectNameLeak(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.length > 90) return true
  if (/[.!?]$/.test(trimmed)) return true

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 12) return true

  const lower = trimmed.toLowerCase()
  const narrativeSignals = [
    'responsible for',
    'built ',
    'building ',
    'designed ',
    'developed ',
    'created ',
    'improved ',
    'using ',
    'through ',
    'from ',
    'with ',
  ]

  return narrativeSignals.some(signal => lower.includes(signal))
}

function assessProjects(data: ResumeData, issues: string[]): number {
  if (data.projects.length === 0) return 0

  let score = 8
  const suspiciousNames = data.projects.filter(item => looksLikeProjectNameLeak(item.name))
  const namedProjects = data.projects.filter(item => item.name.trim().length > 0)
  const describedProjects = data.projects.filter(item => item.description.trim() || getProjectBullets(item).length > 0)

  if (namedProjects.length < data.projects.length) {
    score -= 3
    issues.push('some project names missing')
  }

  if (describedProjects.length < data.projects.length) {
    score -= 2
    issues.push('some project details missing')
  }

  if (suspiciousNames.length > 0) {
    score -= 6
    issues.push('project names look like description text')
  }

  return Math.max(0, score)
}

export function estimateResumeDataTextLength(data: ResumeData | null | undefined): number {
  if (!data) return 0

  const parts: string[] = [
    data.name,
    data.currentRole,
    data.summary,
    data.email,
    data.phone,
    data.location,
    data.linkedin,
    data.website,
    ...getResumeSkills(data),
    ...data.languages,
    ...data.interests,
    ...data.references,
  ]

  for (const item of data.experience) {
    parts.push(item.title, item.company, item.location, item.startDate, item.endDate, item.summary ?? '')
    parts.push(...item.bullets)
  }

  for (const item of data.education) {
    parts.push(item.institution, item.degree, item.field, item.startDate ?? '', item.endDate ?? '', item.graduationDate ?? '', item.gpa)
  }

  for (const item of data.projects) {
    parts.push(item.name, item.description, ...getProjectBullets(item), ...(item.technologies ?? []))
  }

  for (const item of data.certifications) {
    parts.push(item.name, item.issuer, item.date)
  }

  for (const item of data.volunteer) {
    parts.push(item.title, item.company, item.location, item.startDate, item.endDate, item.summary ?? '')
    parts.push(...item.bullets)
  }

  for (const item of data.awards) parts.push(item.title, item.issuer, item.date)
  for (const item of data.publications) parts.push(item.title, item.publisher, item.date)

  for (const section of data.customSections ?? []) {
    parts.push(section.title)
    if (section.type === 'text') parts.push(section.text ?? '')
    if (section.type === 'tags') parts.push(...(section.tags ?? []))
    if (section.type === 'complex') {
      for (const item of section.items ?? []) {
        parts.push(item.title, item.company, item.location, item.startDate, item.endDate, item.summary ?? '')
        parts.push(...(item.bullets ?? []))
      }
    }
  }

  return parts
    .map(part => part?.trim())
    .filter(Boolean)
    .join('\n')
    .length
}

export function assessResumeParseConfidence(
  data: ResumeData | null | undefined,
  context?: ResumeParseConfidenceContext,
): ResumeParseConfidence {
  if (!data) {
    return {
      score: 0,
      level: 'low',
      issues: ['parse returned empty result'],
    }
  }

  const issues: string[] = []
  let score = 0

  score += data.name ? 8 : (issues.push('missing name'), 0)
  score += data.email ? 8 : (issues.push('missing email'), 0)
  score += data.phone ? 5 : 0
  score += data.location ? 3 : 0
  score += data.linkedin || data.website ? 3 : 0
  score += data.currentRole ? 5 : 0
  score += assessSummary(data.summary, issues)
  score += assessExperience(data, issues)
  score += assessEducation(data, issues)
  score += assessSkills(data, issues)
  score += assessProjects(data, issues)

  const populatedSections = [
    data.experience.length > 0,
    data.education.length > 0,
    getResumeSkills(data).length > 0,
    data.projects.length > 0,
    data.certifications.length > 0,
    data.languages.length > 0,
    data.volunteer.length > 0,
    data.awards.length > 0,
    data.publications.length > 0,
    data.references.length > 0,
    (data.customSections?.length ?? 0) > 0,
  ].filter(Boolean).length

  if (populatedSections >= 4) {
    score += 12
  } else if (populatedSections >= 3) {
    score += 8
  } else if (populatedSections >= 2) {
    score += 4
    issues.push('few sections populated')
  } else {
    issues.push('very few sections populated')
  }

  const sourceTextLength =
    typeof context?.sourceTextLength === 'number'
      ? context.sourceTextLength
      : (context?.sourceText?.trim().length ?? 0)

  if (sourceTextLength >= 300) {
    const parsedTextLength = estimateResumeDataTextLength(data)
    const coverageRatio = parsedTextLength / sourceTextLength
    const missingChars = Math.max(0, sourceTextLength - parsedTextLength)

    if (coverageRatio < 0.2) {
      score -= 28
      issues.push('very low extraction coverage')
      score = Math.min(score, 58)
    } else if (coverageRatio < 0.3) {
      score -= 18
      issues.push('low extraction coverage')
      score = Math.min(score, missingChars >= 500 ? 58 : 70)
    } else if (sourceTextLength >= 900 && missingChars >= 500 && coverageRatio < 0.55) {
      score -= 18
      issues.push('parsed text materially shorter than source')
      score = Math.min(score, 58)
    } else if (coverageRatio < 0.4) {
      score -= 8
      issues.push('partial extraction coverage')
      score = Math.min(score, 80)
    }

    if (sourceTextLength >= 1200 && parsedTextLength < 500) {
      score -= 10
      issues.push('parsed payload too short for source length')
    }
  }

  const uniqueIssues = uniqueIssueList(issues)
  const normalizedScore = Math.max(0, Math.min(100, score))

  return {
    score: normalizedScore,
    level: normalizedScore >= 80 ? 'high' : normalizedScore >= 62 ? 'medium' : 'low',
    issues: uniqueIssues,
  }
}

export function shouldAttemptRepair(candidate: ResumeParseCandidate | null): boolean {
  if (!candidate) return true
  if (candidate.confidence.level === 'low') return true
  // Also repair medium-confidence parses — deterministic parsers often produce
  // structurally valid but incomplete results that the LLM parser can improve.
  if (candidate.confidence.level === 'medium') return true

  return candidate.confidence.issues.some(issue =>
    issue === 'summary contains downstream section content' ||
    issue === 'experience entries missing title or company' ||
    issue === 'project names look like description text' ||
    issue === 'missing experience section' ||
    issue === 'experience bullets missing' ||
    issue === 'some experience bullets missing' ||
    issue === 'very few sections populated' ||
    issue === 'very low extraction coverage' ||
    issue === 'low extraction coverage' ||
    issue === 'parsed text materially shorter than source'
  )
}

export function chooseBetterParseCandidate(
  current: ResumeParseCandidate | null,
  next: ResumeParseCandidate | null,
): ResumeParseCandidate | null {
  if (!next) return current
  if (!current) return next

  if (next.confidence.score !== current.confidence.score) {
    return next.confidence.score > current.confidence.score ? next : current
  }

  return sourceWeight(next.source) > sourceWeight(current.source) ? next : current
}
