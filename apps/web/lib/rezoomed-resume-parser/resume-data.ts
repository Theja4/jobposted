// @ts-nocheck

import type { EducationItem, ExperienceItem, ProjectItem, ResumeData, SkillSection } from './types'

// ─── Unicode safety ──────────────────────────────────────────────────────────
//
// Resumes are shown in many contexts (preview, PDF, recruiter's ATS, the user's
// own email). Two Unicode patterns can break layout or actively mislead readers:
//
//  1. Bidi override characters (LRO U+202D, RLO U+202E). These actively flip
//     the visual order of text without changing the logical order — perfect
//     for spoofing. A name like "John‮kraD" renders mirrored. We strip
//     ONLY these two; legitimate embedding (LRE/RLE/PDF) and isolate (LRI/RLI
//     /FSI/PDI) chars are preserved for users with mixed-direction names.
//
//  2. Zalgo: arbitrarily long stacks of combining marks on one base character.
//     This makes a single line render hundreds of pixels tall, blowing up
//     pagination measurements. We cap to 4 combining marks per base.
//
//  3. Zero-width characters (U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+FEFF BOM,
//     U+2060 WJ). These let attackers smuggle invisible content past
//     trim()-based empty-field validation, so a field "looks empty" but
//     stores hidden text. ZWNJ/ZWJ are legitimate in some scripts (Persian,
//     Hindi) so we only strip them at field-start/end, leaving them mid-word.
const BIDI_OVERRIDE_CHARS = /[‭‮]/g
const ZERO_WIDTH_BOUNDARY_CHARS = /[​‌‍⁠﻿]+/g
const COMBINING_MARK = /\p{M}/gu

function capCombiningMarks(text: string, maxPerBase = 4): string {
  // Walk graphemes; if a base char has more than maxPerBase combining marks
  // following it, drop the excess. Cheap, ASCII-safe-by-default.
  let result = ''
  let runCount = 0
  for (const ch of text) {
    if (COMBINING_MARK.test(ch)) {
      runCount += 1
      if (runCount <= maxPerBase) result += ch
    } else {
      runCount = 0
      result += ch
    }
    COMBINING_MARK.lastIndex = 0
  }
  return result
}

export function sanitizeUserText(value: string | null | undefined): string {
  if (!value) return ''
  // 1. Strip explicit bidi override chars (security).
  // 2. Strip zero-width chars at the start/end so trim()-based validation
  //    sees the field as truly empty when the user means it to be.
  // 3. Cap Zalgo stacks so pagination stays sane.
  // 4. Leave everything else alone so legitimate multilingual content survives.
  const noBidi = value.replace(BIDI_OVERRIDE_CHARS, '')
  const trimmedZW = noBidi
    .replace(new RegExp(`^${ZERO_WIDTH_BOUNDARY_CHARS.source}`), '')
    .replace(new RegExp(`${ZERO_WIDTH_BOUNDARY_CHARS.source}$`), '')
  return capCombiningMarks(trimmedZW)
}

/**
 * Apply sanitizeUserText recursively to every string in the ResumeData tree.
 * Cheap — runs only on load/save (via syncResumeData), not per-keystroke.
 * Anything that isn't a string (numbers, booleans, nested objects, arrays) is
 * walked but otherwise untouched.
 */
function sanitizeResumeDataDeep<T>(value: T): T {
  if (typeof value === 'string') return sanitizeUserText(value) as unknown as T
  if (Array.isArray(value)) return value.map(sanitizeResumeDataDeep) as unknown as T
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeResumeDataDeep(val)
    }
    return result as T
  }
  return value
}

function dedupe(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

export function splitSkillInput(value: string) {
  const explicitSeparatorPattern = /[,\n|;·•∙⋅]+/
  const directParts = value
    .split(explicitSeparatorPattern)
    .map(part => part.trim())
    .filter(Boolean)

  if (explicitSeparatorPattern.test(value)) return directParts

  const compact = value.trim().replace(/\s+/g, ' ')
  if (!compact) return []

  const tokens = compact.split(' ').filter(Boolean)
  if (tokens.length <= 3) return [compact]

  const phraseEndHints = new Set([
    'gathering', 'specifications', 'documentation', 'flows', 'stories', 'criteria', 'analysis',
    'interviews', 'scrum', 'waterfall', 'planning', 'management', 'confluence', 'market',
    'sql', 'python', 'apis', 'rag', 'java', 'springboot', 'git', 'html/css', 'suite',
    'demonstrations', 'interviewing', 'reporting', 'automation', 'testing', 'delivery',
  ])

  const connectors = new Set(['&', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'of', 'to', 'by', 'the', 'a', 'an'])

  const looksLikeBoundaryToken = (token: string) =>
    /^[A-Z]/.test(token) || /^[A-Z0-9/&+-]{2,}$/.test(token) || token.includes('/')

  const looksLikePhraseEnd = (token: string, phrase: string[]) => {
    const lower = token.toLowerCase()
    if (connectors.has(lower)) return false
    if (phraseEndHints.has(lower)) return true
    if (/^(uat|jira|sql|python|java|git|rag)$/i.test(token)) return true
    if (token.includes('/')) return true
    if (phrase.length >= 3) return true
    return false
  }

  const phrases: string[] = []
  let current: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    current.push(tokens[index])
    const nextToken = tokens[index + 1]
    if (!nextToken) {
      phrases.push(current.join(' '))
      break
    }

    if (looksLikeBoundaryToken(nextToken) && looksLikePhraseEnd(tokens[index], current)) {
      phrases.push(current.join(' '))
      current = []
    }
  }

  return phrases.length > 1 ? phrases : [compact]
}

function normalizeSkillValues(values: string[]) {
  const splitValues = values.flatMap(splitSkillInput)
  const mergedValues: string[] = []

  for (let index = 0; index < splitValues.length; index += 1) {
    const current = splitValues[index]
    const next = splitValues[index + 1]

    if (/^[A-Z0-9]+\/[A-Z0-9]+$/i.test(current) && /^testing$/i.test(next ?? '')) {
      mergedValues.push(`${current} ${next}`)
      index += 1
      continue
    }

    mergedValues.push(current)
  }

  return dedupe(mergedValues)
}

export function flattenSkillSections(skillSections: SkillSection[] | undefined | null) {
  if (!skillSections?.length) return []
  return normalizeSkillValues(skillSections.flatMap(section => section.skills ?? []))
}

export function normalizeSkillSections(
  skillSections: SkillSection[] | undefined | null,
  fallbackSkills: string[] = []
) {
  const normalized = (skillSections ?? [])
    .map(section => ({
      title: (section.title ?? '').trim(),
      tag: (section.tag ?? '').trim(),
      skills: normalizeSkillValues(section.skills ?? []),
    }))
    .filter(section => section.title || section.tag || section.skills.length > 0)

  if (normalized.length > 0) return normalized
  if (fallbackSkills.length === 0) return []

  return [
    {
      title: 'Core Skills',
      tag: '',
      skills: normalizeSkillValues(fallbackSkills),
    },
  ]
}

export function getResumeSkills(data: Pick<ResumeData, 'skills' | 'skillSections'>) {
  const fromSections = flattenSkillSections(data.skillSections)
  return fromSections.length > 0 ? fromSections : dedupe(data.skills ?? [])
}

export function getProjectBullets(project: Pick<ProjectItem, 'bullets' | 'description'>) {
  return dedupe(project.bullets ?? [])
}

export function getProjectDescription(project: Pick<ProjectItem, 'bullets' | 'description'>) {
  return project.description?.trim() ?? ''
}

function normalizeComparableText(value: string) {
  return value
    .replace(/[•\-*›▸▹]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function shouldMergeProjectBullet(current: string, next: string) {
  const currentTrimmed = current.trim()
  const nextTrimmed = next.trim()

  if (!currentTrimmed || !nextTrimmed) return false
  if (/[.!?]$/.test(currentTrimmed)) return false
  if (/^[a-z(]/.test(nextTrimmed)) return true
  if (currentTrimmed.split(/\s+/).length <= 3) return true

  return false
}

function mergeWrappedProjectBullets(bullets: string[]) {
  const merged: string[] = []

  for (const bullet of bullets) {
    if (merged.length === 0) {
      merged.push(bullet)
      continue
    }

    const previous = merged[merged.length - 1] ?? ''
    if (shouldMergeProjectBullet(previous, bullet)) {
      merged[merged.length - 1] = `${previous} ${bullet}`.replace(/\s+/g, ' ').trim()
      continue
    }

    merged.push(bullet)
  }

  return merged
}

function normalizeProjectItem(item: ProjectItem): ProjectItem {
  const description = getProjectDescription(item)
  const normalizedDescription = description.replace(/\s+/g, ' ').trim().toLowerCase()
  const mergedBullets = mergeWrappedProjectBullets(getProjectBullets(item))
  const normalizedMergedBullets = normalizeComparableText(mergedBullets.join(' '))

  const bullets = mergedBullets.filter((bullet) => {
    if (!normalizedDescription) return true
    return bullet.replace(/\s+/g, ' ').trim().toLowerCase() !== normalizedDescription
  })

  const finalBullets =
    normalizedDescription && normalizedMergedBullets === normalizeComparableText(description)
      ? []
      : bullets

  return {
    ...item,
    description,
    bullets: finalBullets,
  }
}

export function getEducationDateLabel(education: Pick<EducationItem, 'startDate' | 'endDate' | 'graduationDate'>) {
  const startDate = education.startDate?.trim() ?? ''
  const endDate = education.endDate?.trim() ?? ''
  const graduationDate = education.graduationDate?.trim() ?? ''

  if (startDate && endDate) return `${startDate} - ${endDate}`
  if (endDate) return endDate
  if (startDate) return startDate
  return graduationDate
}

const GPA_SEGMENT_RE = /\b(?:CGPA|GPA)\b\s*[:\-]?\s*([0-9]+(?:\.\d+)?(?:\s*\/\s*[0-9]+(?:\.\d+)?)?)/i
const GPA_VALUE_ONLY_RE = /^([0-9]+(?:\.\d+)?(?:\s*\/\s*[0-9]+(?:\.\d+)?)?)$/
const GPA_REMOVAL_RE = /\s*(?:[|,;·•]\s*)?\b(?:CGPA|GPA)\b\s*[:\-]?\s*[0-9]+(?:\.\d+)?(?:\s*\/\s*[0-9]+(?:\.\d+)?)?\s*/gi
const LOCATION_LIKE_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/
const ROLE_FRAGMENT_RE = /(analyst|engineer|developer|manager|consultant|intern|designer|specialist|associate|lead|architect|administrator|product|business|full stack)/i

function normalizeGpaValue(value: string, strict = false) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const segmentMatch = trimmed.match(GPA_SEGMENT_RE)
  if (segmentMatch?.[1]) {
    return segmentMatch[1].replace(/\s*\/\s*/g, ' / ').trim()
  }

  const valueOnlyMatch = trimmed.match(GPA_VALUE_ONLY_RE)
  if (valueOnlyMatch?.[1]) {
    return valueOnlyMatch[1].replace(/\s*\/\s*/g, ' / ').trim()
  }

  return strict ? '' : trimmed
}

function stripEmbeddedGpa(value: string) {
  return value
    .replace(GPA_REMOVAL_RE, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*[|,;·•-]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeEducationItem(item: EducationItem): EducationItem {
  const existingGpa = normalizeGpaValue(item.gpa ?? '')
  const degreeWithoutGpa = stripEmbeddedGpa(item.degree ?? '')
  const fieldWithoutGpa = stripEmbeddedGpa(item.field ?? '')
  // Only derive GPA from degree/field text if gpa was never set (undefined/null).
  // An empty string means the user explicitly cleared it.
  const derivedGpa = item.gpa != null
    ? existingGpa
    : (existingGpa || normalizeGpaValue(item.degree ?? '', true) || normalizeGpaValue(item.field ?? '', true))

  let degree = degreeWithoutGpa
  let field = fieldWithoutGpa

  if (!field) {
    const degreeFieldMatch = degree.match(/^(.*?)\s+\bin\b\s+(.+)$/i)
    if (degreeFieldMatch) {
      degree = degreeFieldMatch[1]?.trim() ?? degree
      field = degreeFieldMatch[2]?.trim() ?? ''
    }
  }

  // Normalize graduationDate and endDate.
  // We are moving towards using endDate as the primary field for the end of the education period.
  const endDate = item.endDate?.trim() ?? ''
  const graduationDate = (item.graduationDate?.trim() || endDate)

  return {
    ...item,
    degree,
    field,
    gpa: derivedGpa,
    startDate: item.startDate?.trim() ?? '',
    endDate,
    graduationDate,
  }
}

function normalizeExperienceLikeItem<T extends ExperienceItem>(item: T): T {
  const title = item.title?.trim() ?? ''
  const company = item.company?.trim().replace(/[|,]+$/g, '').trim() ?? ''
  let location = item.location?.trim().replace(/^[|,]+/g, '').replace(/[|,]+$/g, '').trim() ?? ''
  let nextTitle = title

  const locationLooksLikeRoleFragment =
    Boolean(location) &&
    ROLE_FRAGMENT_RE.test(location) &&
    (
      !LOCATION_LIKE_RE.test(location) ||
      nextTitle.startsWith('&') ||
      /analyst|product|business|engineer|developer|manager|consultant|intern|designer|specialist|associate|lead|architect|administrator|full stack/i.test(location)
    )

  if (locationLooksLikeRoleFragment) {
    nextTitle = nextTitle
      ? nextTitle.startsWith('&')
        ? `${location} ${nextTitle}`
        : `${nextTitle} ${location}`
      : location
    nextTitle = nextTitle.replace(/\s+/g, ' ').trim()
    location = ''
  }

  if (nextTitle.startsWith('& ') && ROLE_FRAGMENT_RE.test(company)) {
    nextTitle = `${company} ${nextTitle}`.replace(/\s+/g, ' ').trim()
  }

  return {
    ...item,
    title: nextTitle,
    company,
    location,
    bullets: (item.bullets ?? []).map(bullet => bullet.trim()).filter(Boolean),
  }
}

export function syncResumeData(data: Partial<ResumeData>): ResumeData {
  const skillSections = normalizeSkillSections(data.skillSections, data.skills ?? [])
  const skills = getResumeSkills({ skills: data.skills ?? [], skillSections })
  const experience = (data.experience ?? []).map(item => normalizeExperienceLikeItem(item))
  const volunteer = (data.volunteer ?? []).map(item => normalizeExperienceLikeItem(item))
  const currentRole = (data.currentRole ?? '').trim()
  const normalizedCurrentRole =
    currentRole.startsWith('&') && experience[0]?.title
      ? experience[0].title
      : currentRole

  const synced: ResumeData = {
    name: data.name ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    location: data.location ?? '',
    linkedin: data.linkedin ?? '',
    website: data.website ?? '',
    summary: data.summary ?? '',
    currentRole: normalizedCurrentRole,
    experience,
    education: (data.education ?? []).map(item => normalizeEducationItem(item)),
    skills,
    skillSections,
    certifications: data.certifications ?? [],
    projects: (data.projects ?? []).map(item => normalizeProjectItem(item)),
    languages: data.languages ?? [],
    volunteer,
    interests: data.interests ?? [],
    awards: data.awards ?? [],
    publications: data.publications ?? [],
    references: data.references ?? [],
    customSections: (data.customSections ?? []).map(section =>
      section.type === 'complex'
        ? { ...section, items: (section.items ?? []).map(item => normalizeExperienceLikeItem(item)) }
        : section,
    ),
  }
  // Final safety pass — strip dangerous bidi-override codepoints and cap
  // Zalgo. Cheap because it only runs on load/save (not per keystroke).
  return sanitizeResumeDataDeep(synced)
}

export function resumeDataToPlainText(data: ResumeData | null | undefined): string {
  if (!data) return ''

  const safe = syncResumeData(data)
  const parts: string[] = [
    safe.name,
    safe.currentRole,
    safe.summary,
    safe.email,
    safe.phone,
    safe.location,
    safe.linkedin,
    safe.website,
  ]

  for (const item of safe.experience) {
    parts.push(item.title, item.company, item.location, item.startDate, item.endDate, item.summary ?? '')
    parts.push(...item.bullets)
  }

  for (const item of safe.education) {
    parts.push(item.institution, item.degree, item.field, item.startDate ?? '', item.endDate ?? '', item.graduationDate ?? '', item.gpa)
  }

  const skillSections = safe.skillSections ?? []
  if (skillSections.length > 0) {
    parts.push('Skills')
    for (const section of skillSections) {
      const title = section.title?.trim() || 'Skills'
      const tag = section.tag?.trim()
      const label = tag ? `${title} (${tag})` : title
      const skillsLine = (section.skills ?? []).map(skill => skill.trim()).filter(Boolean).join(', ')
      parts.push(skillsLine ? `${label}: ${skillsLine}` : label)
    }
  } else {
    parts.push(...safe.skills)
  }

  for (const item of safe.projects) {
    parts.push(item.name, item.description, ...(item.bullets ?? []), ...(item.technologies ?? []))
  }

  for (const item of safe.certifications) parts.push(item.name, item.issuer, item.date)
  for (const item of safe.volunteer) {
    parts.push(item.title, item.company, item.location, item.startDate, item.endDate, item.summary ?? '')
    parts.push(...item.bullets)
  }
  for (const item of safe.awards) parts.push(item.title, item.issuer, item.date)
  for (const item of safe.publications) parts.push(item.title, item.publisher, item.date)
  parts.push(...safe.languages, ...safe.interests, ...safe.references)

  for (const section of safe.customSections ?? []) {
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

  return parts.map(part => part?.trim()).filter(Boolean).join('\n')
}
