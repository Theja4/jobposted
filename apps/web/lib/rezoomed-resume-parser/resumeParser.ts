// @ts-nocheck

import type { ResumeData, ExperienceItem } from './types'
import { normalizeSkillSections, splitSkillInput, syncResumeData } from './resume-data'
import { pagesToLines, type ExtractedPage } from './pdfExtractor'
import { BULLET_RE } from './parsers/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionName =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'languages'
  | 'volunteer'
  | 'interests'
  | 'awards'
  | 'publications'
  | 'references'

type StructuredLine = {
  text: string
  isBold: boolean
  fontSize: number
  x: number
  y: number
  pageNumber: number
}

// ─── Text normalisation ───────────────────────────────────────────────────────

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}

function normalizeHeading(text: string): string {
  return normalise(text)
    .replace(/[:#•*]+/g, '')
    .replace(/[()]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[\/]+/g, ' ')
    // Strip leading numbering: "1.", "1)", "I.", "II.", etc.
    .replace(/^(?:\d+[.)]\s*|[IVXLC]+[.)]\s*)/i, '')
    // Strip surrounding decorative chars: dashes, equals, underscores, tildes
    .replace(/^[-=_~|]+\s*/, '')
    .replace(/\s*[-=_~|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── Section detection ────────────────────────────────────────────────────────

const SECTION_ALIASES: Record<SectionName, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'career summary',
    'executive summary',
    'profile',
    'professional profile',
    'career profile',
    'objective',
    'career objective',
    'professional objective',
    'about me',
    'about',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'relevant experience',
    'employment',
    'employment history',
    'work history',
    'career history',
    'positions',
    'positions held',
    'professional background',
  ],
  education: [
    'education',
    'educational background',
    'academic background',
    'academic history',
    'academics',
    'academia',
    'qualifications',
    'qualification',
    'academic qualifications',
    'education and training',
    'degrees',
  ],
  skills: [
    'skills',
    'technical skills',
    'core skills',
    'key skills',
    'technical proficiencies',
    'proficiencies',
    'expertise',
    'areas of expertise',
    'core competencies',
    'competencies',
    'technologies',
    'technical stack',
    'tool stack',
    'tools and technologies',
  ],
  certifications: [
    'certifications',
    'certification',
    'certificates',
    'certificate',
    'licenses',
    'license',
    'credentials',
    'professional certifications',
  ],
  projects: [
    'projects',
    'project experience',
    'selected projects',
    'personal projects',
    'academic projects',
    'side projects',
    'key projects',
  ],
  languages: [
    'languages',
    'language',
    'language proficiency',
    'spoken languages',
  ],
  volunteer: [
    'volunteer',
    'volunteer experience',
    'volunteer work',
    'community service',
    'community involvement',
  ],
  interests: [
    'interests',
    'interest',
    'hobbies',
    'activities',
    'extracurricular',
    'extracurriculars',
    'personal interests',
  ],
  awards: [
    'awards',
    'award',
    'honors',
    'honours',
    'awards and honors',
    'awards and honours',
    'achievements',
    'accomplishments',
  ],
  publications: [
    'publications',
    'publication',
    'research',
    'research publications',
    'papers',
    'journal articles',
  ],
  references: [
    'references',
    'reference',
  ],
}

function detectSection(line: string): SectionName | null {
  const segments = line.split(/\s+\|\s+/).map(segment => normalizeHeading(segment))

  for (const stripped of segments) {
    for (const [name, aliases] of Object.entries(SECTION_ALIASES) as Array<[SectionName, string[]]>) {
      if (aliases.includes(stripped)) return name
    }
    // Handle combined headings like "education and certifications" — match
    // the first recognized part so content goes to the right section
    if (stripped.includes(' and ')) {
      const parts = stripped.split(' and ').map(p => p.trim())
      for (const part of parts) {
        for (const [name, aliases] of Object.entries(SECTION_ALIASES) as Array<[SectionName, string[]]>) {
          if (aliases.includes(part)) return name
        }
      }
    }
  }
  return null
}

// ─── Regex field extractors ───────────────────────────────────────────────────

const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.]+/
// Phone regex: must contain at least one of (+, parens, or dash) so we don't
// match raw year ranges like "2019 2022 4". Plus, accept country-code form.
const PHONE_RE = /(\+?\d[\d\s()\-.]{6,}\d|\(\d{2,5}\)[\d\s\-.]{6,}\d|\d{3}[\s\-.]\d{3}[\s\-.]\d{4})/
const LINKEDIN_RE = /linkedin\.com\/in\/([\w\-]+)/i
const WEBSITE_EXCLUDE = /gmail|outlook|yahoo|apple\.com|google\.com|microsoft|linkedin/i
const URL_RE = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi
const DATE_MONTH_RE = /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*[\s,]+\d{4}/i
// Numeric "month/year" — accept /, -, . separators so 01/2022, 01-2022, 01.2022 all parse.
const DATE_NUMERIC_RE = /\b\d{1,2}[/\-.]\d{4}\b/i
// Year ranges like "2019 - 2022" or "2019-Present" with relaxed whitespace + lower-case present.
const DATE_YEAR_RANGE_RE = /\d{4}\s*[-–—]\s*(\d{4}|present|current|now|ongoing)/i
const DATE_NUMERIC_RANGE_RE = /\b\d{1,2}[/\-.]\d{4}\s*[-–—]\s*(?:\d{1,2}[/\-.]\d{4}|present|current|now|ongoing)\b/i
// ISO-like 2022-03 (year-month, common in EU resumes)
const DATE_ISO_RE = /\b(19|20)\d{2}-(0[1-9]|1[0-2])\b/
const YEAR_RE = /\b(19|20)\d{2}\b/
const LOCATION_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/
const HEADER_SPLIT_RE = /\s+\|\s+|\s+[–—]\s+|\s+@\s+|\s+\bat\b\s+/i

function extractEmail(text: string): string {
  return EMAIL_RE.exec(text)?.[0] ?? ''
}

function extractPhone(text: string): string {
  const m = PHONE_RE.exec(text)
  return m ? m[1].trim() : ''
}

function extractLinkedIn(text: string): string {
  const m = LINKEDIN_RE.exec(text)
  return m ? `https://linkedin.com/in/${m[1]}` : ''
}

function extractWebsite(text: string): string {
  const matches = text.match(URL_RE) ?? []
  return matches.find(u => !WEBSITE_EXCLUDE.test(u) && !LINKEDIN_RE.test(u)) ?? ''
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isLikelyDateLine(text: string): boolean {
  return (
    DATE_NUMERIC_RANGE_RE.test(text) ||
    DATE_YEAR_RANGE_RE.test(text) ||
    DATE_MONTH_RE.test(text) ||
    DATE_NUMERIC_RE.test(text) ||
    DATE_ISO_RE.test(text)
  )
}

function extractDateRange(text: string): { start: string; end: string } {
  const numericRangeMatch = DATE_NUMERIC_RANGE_RE.exec(text)
  if (numericRangeMatch) {
    const parts = numericRangeMatch[0].split(/[-–—]/).map(segment => segment.trim())
    return { start: parts[0] ?? '', end: parts[1] ?? '' }
  }
  const rangeMatch = DATE_YEAR_RANGE_RE.exec(text)
  if (rangeMatch) {
    const parts = rangeMatch[0].split(/[-–—]/).map(s => s.trim())
    return { start: parts[0] ?? '', end: parts[1] ?? '' }
  }
  const monthMatches = [...text.matchAll(new RegExp(DATE_MONTH_RE.source, 'gi'))]
  if (monthMatches.length >= 2) {
    return { start: monthMatches[0][0], end: monthMatches[1][0] }
  }
  if (monthMatches.length === 1) {
    return { start: monthMatches[0][0], end: '' }
  }
  const numericMatch = DATE_NUMERIC_RE.exec(text)
  if (numericMatch) {
    return { start: numericMatch[0], end: '' }
  }
  const yearMatch = YEAR_RE.exec(text)
  return { start: yearMatch?.[0] ?? '', end: '' }
}

const isBulletLine = (l: string) => BULLET_RE.test(l) || /^\s{4,}/.test(l)

function isContactLikeLine(text: string): boolean {
  return EMAIL_RE.test(text) || PHONE_RE.test(text) || URL_RE.test(text) || LINKEDIN_RE.test(text) || LOCATION_RE.test(text)
}

function splitHeaderLine(line: string): string[] {
  return line
    .split(HEADER_SPLIT_RE)
    .map(segment => segment.trim())
    .filter(Boolean)
}

function extractCompanyAndLocation(line: string): { company: string; location: string } {
  const location = LOCATION_RE.exec(line)?.[0] ?? ''
  const withoutLocation = location
    ? line.replace(location, '').replace(/\s{2,}/g, ' ').trim()
    : line.trim()
  const parts = splitHeaderLine(withoutLocation)
  const company =
    parts.find(part => part && !LOCATION_RE.test(part)) ??
    withoutLocation.replace(/[-–—|,]+$/g, '').trim()

  return {
    company: company.trim(),
    location,
  }
}

function isLikelyExperienceHeader(line: string): boolean {
  const parts = splitHeaderLine(line)
  if (parts.length < 2 || parts.length > 4) return false
  if (isContactLikeLine(line) || isLikelyDateLine(line) || isBulletLine(line)) return false
  return parts.every(part => part.length > 1 && part.length <= 60)
}

function looksLikeNarrativeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 10) return true
  if (/[.!?]$/.test(trimmed) && words.length >= 6) return true
  if (trimmed.includes(' — ') && words.length >= 8) return true

  return false
}

const EXPERIENCE_BULLET_START_RE =
  /^(achieved|analysed|analyzed|architected|automated|built|championed|collaborated|coordinated|created|delivered|designed|developed|drove|enabled|executed|implemented|improved|increased|launched|led|maintained|managed|migrated|operated|optimised|optimized|owned|partnered|reduced|resolved|shipped|supported|streamlined|validated|worked|responsible)\b/i

const JOB_TITLE_KEYWORDS_RE =
  /\b(Intern|Engineer|Developer|Manager|Director|Analyst|Architect|Designer|Consultant|Specialist|Coordinator|Administrator|Lead|Officer|Scientist|Researcher|Technician|Associate|Assistant|VP|SVP|EVP|CTO|CEO|CFO|COO|CIO|CMO|CPO|President|Fellow|Head)\b/i

/**
 * Detect standalone job title lines like "Full Stack Developer Intern" that
 * don't contain separator characters (|, –, —). These would be missed by
 * isLikelyExperienceHeader which requires 2+ split parts.
 */
function looksLikeJobTitle(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/)
  if (words.length < 2 || words.length > 8) return false
  if (trimmed.length > 80) return false
  // Must not start with a common action verb (bullet start)
  if (EXPERIENCE_BULLET_START_RE.test(trimmed)) return false
  // Must not look like a narrative sentence
  if (looksLikeNarrativeLine(trimmed)) return false
  // Should contain a role keyword
  if (!JOB_TITLE_KEYWORDS_RE.test(trimmed)) return false
  // Should be mostly title-cased or all-caps words (not sentence case)
  const titleCaseWords = words.filter(w => /^[A-Z]/.test(w) || /^[&\/()]/.test(w))
  if (titleCaseWords.length < words.length * 0.5) return false
  return true
}

function isLikelyUnmarkedBulletStart(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (isLikelyDateLine(trimmed) || detectSection(trimmed) || looksLikeCustomHeadingText(trimmed)) return false
  if (isLikelyExperienceHeader(trimmed) || isContactLikeLine(trimmed)) return false

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 4) return false

  return EXPERIENCE_BULLET_START_RE.test(trimmed) || /^(?:\d+|[0-9]+%|\$)/.test(trimmed)
}

function isLikelyPostDateMetadataLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (isLikelyDateLine(trimmed) || detectSection(trimmed) || isContactLikeLine(trimmed)) return true
  if (looksLikeNarrativeLine(trimmed)) return false

  const words = trimmed.split(/\s+/).filter(Boolean)
  return trimmed.length <= 80 && words.length <= 4
}

function inferBulletsFromUnmarkedExperienceLines(lines: string[]): string[] {
  const inferred: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const words = line.split(/\s+/).filter(Boolean)
    if (inferred.length === 0) {
      if (isLikelyPostDateMetadataLine(line)) continue
      if (words.length >= 4 && !isLikelyDateLine(line) && !detectSection(line)) {
        inferred.push(line)
      }
      continue
    }

    if (isLikelyUnmarkedBulletStart(line)) {
      inferred.push(line)
    } else {
      const previous = inferred[inferred.length - 1] ?? ''
      inferred[inferred.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim()
    }
  }

  return inferred
}

function looksLikeRoleFragment(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (LOCATION_RE.test(trimmed) || isLikelyDateLine(trimmed)) return false

  return (
    trimmed.startsWith('&') ||
    /(analyst|engineer|developer|manager|consultant|intern|designer|specialist|associate|lead|architect|administrator|product|business|full stack)/i.test(trimmed)
  )
}

function normalizeParsedJob(job: ExperienceItem, afterDateNonBullets: string[]): ExperienceItem {
  const normalized: ExperienceItem = {
    ...job,
    title: job.title.trim(),
    company: job.company.trim().replace(/[|,]+$/g, '').trim(),
    location: job.location.trim().replace(/^[|,]+/g, '').replace(/[|,]+$/g, '').trim(),
  }

  if (normalized.location && !LOCATION_RE.test(normalized.location) && looksLikeRoleFragment(normalized.location)) {
    normalized.title = normalized.title
      ? normalized.title.startsWith('&')
        ? `${normalized.location} ${normalized.title}`
        : `${normalized.title} ${normalized.location}`
      : normalized.location
    normalized.title = normalized.title.replace(/\s+/g, ' ').trim()
    normalized.location = ''
  }

  if (
    afterDateNonBullets.length > 1 &&
    normalized.title &&
    normalized.title.startsWith('&') &&
    looksLikeRoleFragment(afterDateNonBullets[1] ?? '')
  ) {
    normalized.title = `${afterDateNonBullets[1]} ${normalized.title}`.replace(/\s+/g, ' ').trim()
  }

  return normalized
}

function inferHeaderFields(headerLines: string[]): { title: string; company: string; location: string } {
  if (headerLines.length === 0) {
    return { title: '', company: '', location: '' }
  }

  const primaryLine = headerLines[0]
  const locationFromPrimary = LOCATION_RE.exec(primaryLine)?.[0] ?? ''
  const normalizedPrimary = locationFromPrimary ? primaryLine.replace(locationFromPrimary, '').replace(/\s{2,}/g, ' ').trim() : primaryLine
  const primaryTokens = splitHeaderLine(normalizedPrimary)

  if (headerLines.length >= 3) {
    const trailingLine = headerLines[headerLines.length - 1]
    const trailingHasLocation = LOCATION_RE.test(trailingLine)
    const trailingParts = splitHeaderLine(trailingLine)

    if (trailingHasLocation || trailingParts.length >= 2) {
      const title = headerLines
        .slice(0, -1)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      const { company, location } = extractCompanyAndLocation(trailingLine)

      if (title) {
        return {
          title,
          company,
          location,
        }
      }
    }
  }

  if (headerLines.length >= 2) {
    const secondaryLine = headerLines[1].trim()
    if (
      secondaryLine.startsWith('&') ||
      /^[a-z&]/.test(secondaryLine) ||
      /[,/-]\s*$/.test(primaryLine)
    ) {
      return {
        title: `${primaryLine} ${secondaryLine}`.replace(/\s+/g, ' ').trim(),
        company: '',
        location: locationFromPrimary,
      }
    }

    return {
      title: primaryTokens[0] || normalizedPrimary,
      company: headerLines[1],
      location: locationFromPrimary,
    }
  }

  if (primaryTokens.length >= 3) {
    return {
      title: primaryTokens[0],
      company: primaryTokens[1],
      location: locationFromPrimary || primaryTokens[2],
    }
  }

  if (primaryTokens.length === 2) {
    return {
      title: primaryTokens[0],
      company: primaryTokens[1],
      location: locationFromPrimary,
    }
  }

  return {
    title: normalizedPrimary,
    company: '',
    location: locationFromPrimary,
  }
}

// ─── Experience parser (two-pass) ─────────────────────────────────────────────
// The old single-pass parser dropped title/company because they appear BEFORE
// the date line and current=null at that point. The two-pass approach finds
// each date line first, then looks backward for header info and forward for bullets.

function parseJobLines(lines: string[]): ExperienceItem[] {
  const jobs: ExperienceItem[] = []

  // Pass 1: find all date line indices
  const dateIndices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && isLikelyDateLine(t)) {
      dateIndices.push(i)
    }
  }

  if (dateIndices.length === 0) {
    // No dates: try to extract at least a single entry from non-bullet lines
    const nonBullets = lines.filter(l => l.trim() && !isBulletLine(l))
    const bullets = lines
      .filter(l => l.trim() && isBulletLine(l))
      .map(l => l.trim().replace(/^[•\-*›▸▹\s]+/, '').trim())
    if (nonBullets.length > 0 || bullets.length > 0) {
      jobs.push({
        title: nonBullets[0]?.trim() ?? '',
        company: nonBullets[1]?.trim() ?? '',
        location: '',
        startDate: '',
        endDate: '',
        bullets,
      })
    }
    return jobs
  }

  // Pass 2: for each date line, extract job block
  for (let di = 0; di < dateIndices.length; di++) {
    const dateIdx = dateIndices[di]
    const nextDateIdx = dateIndices[di + 1] ?? lines.length

    const dateLine = lines[dateIdx].trim()
    const dates = extractDateRange(dateLine)
    const locInDate = LOCATION_RE.exec(dateLine)?.[0] ?? ''
    // Strip date and location from date line to get any inline title fragment
    const inlineFrag = dateLine
      .replace(DATE_NUMERIC_RANGE_RE, '')
      .replace(DATE_YEAR_RANGE_RE, '')
      .replace(new RegExp(DATE_MONTH_RE.source, 'gi'), '')
      .replace(DATE_NUMERIC_RE, '')
      .replace(locInDate, '')
      .replace(/[-–—|,]+/g, ' ')
      .trim()

    // Look backward from the date line to find title/company header lines.
    // Stop at: the previous date line, a bullet line, or the section start.
    const prevDateIdx = dateIndices[di - 1] ?? -1
    const headerLines: string[] = []
    let scanBack = dateIdx - 1
    while (scanBack > prevDateIdx) {
      const backLine = lines[scanBack]
      const backTrimmed = backLine?.trim() ?? ''
      if (!backTrimmed) { scanBack--; continue }
      if (isBulletLine(backLine)) break  // hit previous job's bullets
      if (looksLikeNarrativeLine(backTrimmed)) break
      headerLines.unshift(backTrimmed)
      scanBack--
    }

    const headerFields = inferHeaderFields(headerLines)

    // title: parsed header title, first header line, or inline fragment from the date line
    const title = headerFields.title || headerLines[0] || inlineFrag

    // company: parsed header company or second header line
    let company = headerFields.company
    if (!company && headerLines.length > 1) {
      company = headerLines[1]
    }

    // location: from the date line, or scan header lines
    let location = locInDate || headerFields.location
    if (!location) {
      for (const h of headerLines) {
        const m = LOCATION_RE.exec(h)
        if (m) { location = m[0]; break }
      }
    }

    // Collect lines after the date up to the next job's header
    const bullets: string[] = []
    const afterDateNonBullets: string[] = []
    for (let i = dateIdx + 1; i < nextDateIdx; i++) {
      const raw = lines[i]
      const t = raw?.trim() ?? ''
      if (!t) continue
      if (isBulletLine(raw)) {
        bullets.push(t.replace(/^[•\-*›▸▹\s]+/, '').trim())
      } else {
        const looksLikeBulletContinuation =
          bullets.length > 0 &&
          t.length <= 220 &&
          !isLikelyDateLine(t) &&
          !detectSection(t) &&
          !looksLikeCustomHeadingText(t) &&
          !isLikelyExperienceHeader(t) &&
          !looksLikeJobTitle(t)

        if (looksLikeBulletContinuation) {
          const previous = bullets[bullets.length - 1] ?? ''
          bullets[bullets.length - 1] = `${previous} ${t}`.replace(/\s+/g, ' ').trim()
        } else {
          afterDateNonBullets.push(t)
        }
      }
    }

    // If we got no company from header, a non-bullet line after the date (before bullets) may be the company
    if (!company && afterDateNonBullets.length > 0) {
      const companyCandidate = afterDateNonBullets[0]
      if (
        companyCandidate.length <= 80 &&
        !isLikelyDateLine(companyCandidate)
      ) {
        const parsedCompany = extractCompanyAndLocation(companyCandidate)
        company = parsedCompany.company
        if (!location && parsedCompany.location) {
          location = parsedCompany.location
        }
      }
    }

    if (bullets.length === 0 && afterDateNonBullets.length > 0) {
      bullets.push(...inferBulletsFromUnmarkedExperienceLines(afterDateNonBullets))
    }

    if (title || bullets.length > 0) {
      jobs.push(
        normalizeParsedJob(
          { title, company, location, startDate: dates.start, endDate: dates.end, bullets },
          afterDateNonBullets,
        ),
      )
    }
  }

  return jobs
}

// ─── Section parsers ──────────────────────────────────────────────────────────

function extractSummaryFromPreamble(preamble: string[], name: string, currentRole: string): string {
  const candidateLines: string[] = []

  for (const rawLine of preamble) {
    const line = rawLine.trim()
    if (!line) continue
    if (line === name || line === currentRole) continue
    if (isContactLikeLine(line) || isLikelyDateLine(line) || isBulletLine(line)) continue
    if (detectSection(line) || looksLikeCustomHeadingText(line)) continue
    if (candidateLines.length > 0) {
      if (detectSection(line) || looksLikeCustomHeadingText(line) || isLikelyExperienceHeader(line)) {
        break
      }
    }

    if (line.length < 35) continue

    candidateLines.push(line)
    if (candidateLines.length >= 3) break
  }

  const candidate = candidateLines.join(' ').trim()
  const words = candidate.split(/\s+/).filter(Boolean)
  if (words.length < 12 || words.length > 120) return ''

  return candidate
}

function sanitizeSummaryText(summary: string): string {
  const trimmed = summary.trim()
  if (!trimmed) return ''

  const headingLeak = /(experience|education|skills|projects|certifications|languages|volunteer|interests|awards|publications|references)\s*:?\s+/gi
  const dateHits = trimmed.match(new RegExp(`${DATE_MONTH_RE.source}|${DATE_YEAR_RANGE_RE.source}|${DATE_NUMERIC_RANGE_RE.source}`, 'gi')) ?? []
  const headingHits = trimmed.match(headingLeak) ?? []

  if (headingHits.length >= 2) return ''
  if (dateHits.length >= 2 && trimmed.length > 220) return ''

  return trimmed
}

function parseSummary(lines: string[], preamble: string[], name: string, currentRole: string): string {
  if (lines.length > 0) {
    const collected: string[] = []
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      if (collected.length > 0 && (detectSection(line) || looksLikeCustomHeadingText(line) || isLikelyExperienceHeader(line))) {
        break
      }
      if (isContactLikeLine(line) && collected.length > 0) break
      collected.push(line)
    }
    return sanitizeSummaryText(collected.join(' ').trim())
  }
  return sanitizeSummaryText(extractSummaryFromPreamble(preamble, name, currentRole))
}

function parseSkills(lines: string[]): string[] {
  const parts = lines
    .flatMap(line => splitSkillInput(line.replace(/^[A-Za-z][A-Za-z &/+()-]{1,40}:\s+/, '')))
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 80)
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (!seen.has(key)) { seen.add(key); result.push(p) }
  }
  return result
}

function isLikelySkillLabelFragment(line: string) {
  const compact = line.trim()
  if (!compact) return false
  if (compact.includes(',')) return false
  if (compact.length > 40) return false
  if (/\d/.test(compact)) return false

  const normalized = compact.replace(/:$/, '').trim()
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 4) return false

  return /^[A-Za-z][A-Za-z &/+()-]*:?$/.test(compact)
}

function parseSkillSections(lines: string[]) {
  const sections: Array<{ title: string; skills: string[] }> = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? ''
    if (!line) {
      index += 1
      continue
    }

    const match = /^([A-Za-z][A-Za-z &/+()-]{1,40}):\s+(.+)$/.exec(line)
    if (match) {
      const title = match[1].trim()
      const skills = splitSkillInput(match[2]).filter(Boolean)
      if (skills.length > 0) {
        sections.push({ title, skills })
      }
      index += 1
      continue
    }

    const nextLine = lines[index + 1]?.trim() ?? ''
    const thirdLine = lines[index + 2]?.trim() ?? ''

    // Check if this line is a continuation of the previous skill section's
    // values (PDF line-wrap artifact). e.g. "automation" is the tail end of
    // "intelligent process automation" from the previous line, not a label.
    const prevSection = sections[sections.length - 1]
    const prevEndsIncomplete = prevSection &&
      prevSection.skills.length > 0 &&
      !prevSection.skills[prevSection.skills.length - 1].endsWith('.')

    if (prevEndsIncomplete && isLikelySkillLabelFragment(line)) {
      // If this "label" + next line would form a labeled pair, but the
      // previous section looks like it was cut off, this word is more likely
      // a continuation. Append it to the previous section's last skill or
      // as a new skill entry.
      if (line.includes(',')) {
        prevSection.skills.push(...splitSkillInput(line).filter(Boolean))
      } else {
        // Single word continuation — append to the last skill of the
        // previous section (e.g. "feasibility" + "studies")
        const lastSkill = prevSection.skills[prevSection.skills.length - 1]
        if (lastSkill && !lastSkill.includes(',')) {
          prevSection.skills[prevSection.skills.length - 1] = `${lastSkill} ${line}`
        } else {
          prevSection.skills.push(line)
        }
      }
      index += 1
      continue
    }

    const mergedLabel =
      isLikelySkillLabelFragment(line) && isLikelySkillLabelFragment(nextLine)
        ? `${line.replace(/:$/, '').trim()} ${nextLine.replace(/:$/, '').trim()}`.trim()
        : ''

    if (mergedLabel && thirdLine && !detectSection(thirdLine) && !looksLikeCustomHeadingText(thirdLine)) {
      const skills = splitSkillInput(thirdLine).filter(Boolean)
      if (skills.length > 0) {
        sections.push({ title: mergedLabel, skills })
        index += 3
        continue
      }
    }

    if (isLikelySkillLabelFragment(line) && nextLine && !detectSection(nextLine) && !looksLikeCustomHeadingText(nextLine)) {
      const skills = splitSkillInput(nextLine).filter(Boolean)
      if (skills.length > 0) {
        sections.push({ title: line.replace(/:$/, '').trim(), skills })
        index += 2
        continue
      }
    }

    // Catch-all: if this line contains commas and there's a previous section,
    // it's likely a continuation of the previous section's skills that wrapped
    // to a new line in the PDF (e.g. "studies, functional documentation, SDLC, Agile, Scrum")
    if (prevSection && line.includes(',')) {
      const newSkills = splitSkillInput(line).filter(Boolean)
      // If the first item is a short lowercase word/phrase, it's likely the
      // tail of the previous section's last skill split by a PDF line break.
      // e.g. prev last skill = "feasibility", first item = "studies"
      //   → merge into "feasibility studies"
      if (
        newSkills.length > 0 &&
        prevSection.skills.length > 0
      ) {
        const firstItem = newSkills[0].trim()
        const startsLowercase = /^[a-z]/.test(firstItem)
        const isShort = firstItem.split(/\s+/).length <= 2
        if (startsLowercase && isShort) {
          const lastIdx = prevSection.skills.length - 1
          prevSection.skills[lastIdx] = `${prevSection.skills[lastIdx]} ${firstItem}`
          prevSection.skills.push(...newSkills.slice(1))
        } else {
          prevSection.skills.push(...newSkills)
        }
      } else {
        prevSection.skills.push(...newSkills)
      }
      index += 1
      continue
    }

    index += 1
  }

  if (sections.length > 0) {
    return normalizeSkillSections(sections)
  }

  const fallbackSkills = parseSkills(lines)
  if (fallbackSkills.length === 0) return []

  return normalizeSkillSections([
    {
      title: '',
      tag: '',
      skills: fallbackSkills,
    },
  ])
}

function parseExperience(lines: string[]): ResumeData['experience'] {
  return parseJobLines(lines)
}

function parseVolunteer(lines: string[]): ResumeData['volunteer'] {
  return parseJobLines(lines)
}

function parseEducation(lines: string[]): ResumeData['education'] {
  const entries: ResumeData['education'] = []
  const DEGREE_RE = /Bachelor|Master|PhD|Doctorate|MBA|B\.?S\.?|M\.?S\.?|B\.?E\.?|B\.?Tech|M\.?Tech|Associate/i
  const INSTITUTION_RE = /University|College|Institute|School|Academy/i
  const GPA_RE = /(?:GPA|CGPA)\s*[:\s]+\s*([0-9]+(?:\.\d+)?(?:\s*\/\s*[0-9]+(?:\.\d+)?)?)/i
  const cleanedLines = lines.map(line => line.trim()).filter(Boolean)
  let index = 0

  while (index < cleanedLines.length) {
    const line = cleanedLines[index]
    const degreeMatch = DEGREE_RE.test(line)
    const institutionMatch = INSTITUTION_RE.test(line)

    if (!degreeMatch && !institutionMatch && !isLikelyDateLine(line)) {
      index += 1
      continue
    }

    const entry: ResumeData['education'][0] = {
      institution: institutionMatch ? line : '',
      degree: degreeMatch ? line.replace(/,.*$/, '').trim() : '',
      field: '',
      startDate: '',
      endDate: '',
      graduationDate: '',
      gpa: GPA_RE.exec(line)?.[1]?.replace(/\s*\/\s*/g, ' / ') ?? '',
    }

    if (isLikelyDateLine(line)) {
      const dates = extractDateRange(line)
      entry.startDate = dates.start
      entry.endDate = dates.end || dates.start
      entry.graduationDate = entry.endDate
    } else {
      const inlineDate = extractDateRange(line)
      entry.startDate = inlineDate.start
      entry.endDate = inlineDate.end || inlineDate.start
      entry.graduationDate = entry.endDate
    }

    let consumed = 1
    while (index + consumed < cleanedLines.length) {
      const nextLine = cleanedLines[index + consumed]
      if (detectSection(nextLine)) break

      const nextLooksLikeNewEntry =
        (INSTITUTION_RE.test(nextLine) && Boolean(entry.institution)) ||
        (DEGREE_RE.test(nextLine) && Boolean(entry.degree))

      if (nextLooksLikeNewEntry && !isLikelyDateLine(nextLine)) {
        break
      }

      if (!entry.institution && INSTITUTION_RE.test(nextLine)) {
        entry.institution = nextLine
      } else if (!entry.degree && DEGREE_RE.test(nextLine)) {
        entry.degree = nextLine.replace(/,.*$/, '').trim()
      } else if (!entry.endDate && isLikelyDateLine(nextLine)) {
        const dates = extractDateRange(nextLine)
        entry.startDate = dates.start
        entry.endDate = dates.end || dates.start
        entry.graduationDate = entry.endDate
      } else if (!entry.gpa) {
        entry.gpa = GPA_RE.exec(nextLine)?.[1]?.replace(/\s*\/\s*/g, ' / ') ?? ''
      } else if (!entry.field && entry.degree && nextLine.length <= 100 && !isBulletLine(nextLine)) {
        entry.field = nextLine
      }

      consumed += 1
    }

    if (entry.institution || entry.degree || entry.endDate) {
      entries.push(entry)
    }
    index += consumed
  }

  return entries
}

function parseCertifications(lines: string[]): ResumeData['certifications'] {
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const yearMatch = YEAR_RE.exec(l)
      const issuerMatch = /(?:by|from|–|-)\s+(.+?)(?:\s*[,(]|$)/i.exec(l)
      return {
        name: l.replace(/\s*[-,·].*$/, '').trim(),
        issuer: issuerMatch?.[1]?.trim() ?? '',
        date: yearMatch?.[0] ?? '',
      }
    })
}

function parseProjects(lines: string[]): ResumeData['projects'] {
  const projects: ResumeData['projects'] = []
  let current: ResumeData['projects'][0] | null = null

  const looksLikeProjectTitle = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (trimmed.length > 100) return false
    if (/[.!?]$/.test(trimmed)) return false
    if (looksLikeNarrativeLine(trimmed)) return false

    const words = trimmed.split(/\s+/).filter(Boolean)
    if (words.length > 12) return false

    return true
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const isBullet = /^[•\-*›]/.test(t)
    const techMatch = /(?:Technologies?|Tech\s+Stack|Stack|Tools?|Built\s+with)[:\s]+(.+)/i.exec(t)
    const techInParens = /\(([^)]+)\)\s*$/.exec(t)
    const hasDate = DATE_MONTH_RE.test(t) || DATE_YEAR_RANGE_RE.test(t)

    // A new project starts on a title-like non-bullet line.
    if (!isBullet && !techMatch && !hasDate && looksLikeProjectTitle(t) && (!current || current.description || current.bullets?.length)) {
      if (current) projects.push(current)
      current = { name: t, description: '', bullets: [], technologies: [] }
    } else if (!current && !isBullet && !techMatch && !hasDate) {
      current = { name: t, description: '', bullets: [], technologies: [] }
    } else if (current && techMatch) {
      const techs = techMatch[1].split(/[,|]/).map(s => s.trim()).filter(Boolean)
      current.technologies.push(...techs)
    } else if (current && techInParens && !techMatch) {
      const techs = techInParens[1].split(/[,|]/).map(s => s.trim()).filter(Boolean)
      // Only treat as tech tags if they look like technology names (short words)
      if (techs.every(t => t.length <= 30)) {
        current.technologies.push(...techs)
      }
      const cleanLine = t.replace(techInParens[0], '').replace(/^[•\-*›\s]+/, '').trim()
      if (cleanLine) {
        current.bullets = [...(current.bullets ?? []), cleanLine]
        current.description += (current.description ? ' ' : '') + cleanLine
      }
    } else if (current) {
      // Bullet or long description line
      const cleanLine = t.replace(/^[•\-*›\s]+/, '')
      current.bullets = [...(current.bullets ?? []), cleanLine]
      current.description += (current.description ? ' ' : '') + cleanLine
    }
  }

  if (current) projects.push(current)
  return projects
}

function parseLanguages(lines: string[]): string[] {
  return lines
    .join('\n')
    .split(/[,\n|•\-*]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 30)
}

function parseInterests(lines: string[]): string[] {
  return lines
    .join('\n')
    .split(/[,\n|•\-*]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 60)
}

function parseAwards(lines: string[]): ResumeData['awards'] {
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const yearMatch = YEAR_RE.exec(l)
      const issuerMatch = /(?:by|from|–|-|,)\s+(.+?)(?:\s*[,(]|$)/i.exec(l)
      return {
        title: l.replace(/\s*[-,·–].*$/, '').trim(),
        issuer: issuerMatch?.[1]?.trim() ?? '',
        date: yearMatch?.[0] ?? '',
      }
    })
}

function parsePublications(lines: string[]): ResumeData['publications'] {
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const yearMatch = YEAR_RE.exec(l)
      const publisherMatch = /(?:published\s+in|in|–|-)\s+(.+?)(?:\s*[,(]|$)/i.exec(l)
      return {
        title: l.replace(/\s*[-,·–].*$/, '').trim(),
        publisher: publisherMatch?.[1]?.trim() ?? '',
        date: yearMatch?.[0] ?? '',
      }
    })
}

function parseReferences(lines: string[]): string[] {
  return lines
    .map(l => l.trim())
    .filter(s => s.length > 0 && s.length <= 120)
}

// ─── Spatial section splitter ─────────────────────────────────────────────────

function buildCustomSectionKey(title: string): string {
  return `custom:${title}`
}

function getCustomSectionTitle(key: string): string {
  return key.slice('custom:'.length)
}

function looksLikeCustomHeadingText(text: string): boolean {
  const heading = normalizeHeading(text)
  if (!heading) return false
  if (detectSection(heading)) return false
  if (EMAIL_RE.test(heading) || PHONE_RE.test(heading) || URL_RE.test(heading)) return false
  if (LOCATION_RE.test(heading) || isLikelyDateLine(heading) || isBulletLine(heading)) return false
  if (heading.length > 42) return false

  const words = heading.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 5) return false

  const allCaps = heading === heading.toUpperCase()
  const titleCase = words.every(word => /^[A-Z][A-Za-z0-9&/+\-]*$/.test(word))
  return allCaps || titleCase
}

function isPotentialCustomHeadingLine(line: StructuredLine, medianFontSize: number): boolean {
  return looksLikeCustomHeadingText(line.text) && (line.isBold || line.fontSize >= medianFontSize * 1.05)
}

function detectColumnThreshold(lines: StructuredLine[], medianFontSize: number): number | null {
  const candidates = lines
    .filter(line => {
      const text = line.text.trim()
      if (!text || text.length < 3) return false
      if (EMAIL_RE.test(text) || PHONE_RE.test(text) || URL_RE.test(text)) return false
      if (isLikelyDateLine(text)) return false
      return true
    })
    .sort((a, b) => a.x - b.x)

  if (candidates.length < 16) return null

  const clusters: Array<{
    min: number
    max: number
    center: number
    count: number
    headingCount: number
  }> = []

  for (const line of candidates) {
    const headingHit = detectSection(line.text) || isPotentialCustomHeadingLine(line, medianFontSize)
    const lastCluster = clusters[clusters.length - 1]

    if (lastCluster && Math.abs(line.x - lastCluster.center) <= 48) {
      lastCluster.count += 1
      lastCluster.min = Math.min(lastCluster.min, line.x)
      lastCluster.max = Math.max(lastCluster.max, line.x)
      lastCluster.center = Math.round((lastCluster.min + lastCluster.max) / 2)
      if (headingHit) lastCluster.headingCount += 1
      continue
    }

    clusters.push({
      min: line.x,
      max: line.x,
      center: line.x,
      count: 1,
      headingCount: headingHit ? 1 : 0,
    })
  }

  const stableClusters = clusters.filter(cluster => cluster.count >= 6)
  if (stableClusters.length < 2) return null

  let bestThreshold: number | null = null
  let largestGap = 0

  for (let index = 0; index < stableClusters.length - 1; index += 1) {
    const left = stableClusters[index]
    const right = stableClusters[index + 1]
    const gap = right.min - left.max

    if (gap < 150) continue
    if (left.headingCount === 0 || right.headingCount === 0) continue

    if (gap > largestGap) {
      largestGap = gap
      bestThreshold = Math.round((left.max + right.min) / 2)
    }
  }

  return bestThreshold
}

function splitColumnStructuredLines(
  lines: StructuredLine[],
  medianFontSize: number
): Record<string, string[]> {
  const sections: Record<string, string[]> = { preamble: [] }
  let current = 'preamble'
  let hasStartedSectionFlow = false

  for (const line of lines) {
    const text = line.text.trim()
    if (!text) continue

    const knownSection = detectSection(text)
    if (knownSection) {
      current = knownSection
      sections[current] = sections[current] ?? []
      hasStartedSectionFlow = true
      continue
    }

    if (hasStartedSectionFlow && isPotentialCustomHeadingLine(line, medianFontSize)) {
      current = buildCustomSectionKey(normalizeHeading(text))
      sections[current] = sections[current] ?? []
      continue
    }

    sections[current] = sections[current] ?? []
    sections[current].push(text)
  }

  return sections
}

function splitStructuredLines(
  lines: StructuredLine[],
  medianFontSize: number
): Record<string, string[]> {
  const threshold = detectColumnThreshold(lines, medianFontSize)
  if (threshold === null) {
    return splitColumnStructuredLines(lines, medianFontSize)
  }

  const sectionMaps = [
    splitColumnStructuredLines(lines.filter(line => line.x <= threshold), medianFontSize),
    splitColumnStructuredLines(lines.filter(line => line.x > threshold), medianFontSize),
  ]

  const mergedSections: Record<string, string[]> = { preamble: [] }
  for (const sectionMap of sectionMaps) {
    for (const [sectionName, sectionLines] of Object.entries(sectionMap)) {
      mergedSections[sectionName] = mergedSections[sectionName] ?? []
      mergedSections[sectionName].push(...sectionLines)
    }
  }

  return mergedSections
}

// ─── Spatial name extraction ──────────────────────────────────────────────────

function extractNameFromLines(
  lines: StructuredLine[],
  email: string,
  phone: string,
  medianFontSize: number
): string {
  const firstFive = lines.slice(0, 5)

  for (const line of firstFive) {
    const t = line.text.trim()
    if (!t) continue
    if (EMAIL_RE.test(t) || PHONE_RE.test(t) || URL_RE.test(t)) continue
    if (t === email || t === phone) continue
    if (t.length < 2 || t.length > 50) continue

    const isLargeOrBold = line.isBold || line.fontSize > medianFontSize * 1.2 || line.y < 100
    const words = t.split(/\s+/)
    const looksLikeName =
      words.length >= 2 &&
      words.length <= 5 &&
      words.every(w => /^[\p{L}\p{M}'-]+$/u.test(w))

    if (looksLikeName && isLargeOrBold) return t
  }

  // Fallback: first line that looks like a name regardless of font
  for (const line of firstFive) {
    const t = line.text.trim()
    if (!t || EMAIL_RE.test(t) || PHONE_RE.test(t)) continue
    if (t.length < 2 || t.length > 50) continue
    const words = t.split(/\s+/)
    const looksLikeName =
      words.length >= 2 &&
      words.length <= 5 &&
      words.every(w => /^[\p{L}\p{M}'-]+$/u.test(w))
    if (looksLikeName) return t
  }

  return ''
}

function extractCurrentRoleFromPreamble(preamble: string[], name: string): string {
  for (const rawLine of preamble) {
    const line = rawLine.trim()
    if (!line || line === name) continue
    if (EMAIL_RE.test(line) || PHONE_RE.test(line) || URL_RE.test(line)) continue
    if (LOCATION_RE.test(line) || isLikelyDateLine(line) || detectSection(line)) continue
    if (line.length > 80) continue
    return line
  }

  return ''
}

function buildCustomSections(sections: Record<string, string[]>): ResumeData['customSections'] {
  return Object.entries(sections)
    .filter(([key, lines]) => key.startsWith('custom:') && lines.some(line => line.trim()))
    .map(([key, lines], index) => {
      const title = getCustomSectionTitle(key)
      const titleLower = title.toLowerCase()
      const compactLines = lines.map(line => line.trim()).filter(Boolean)
      const hasComplexSignals = compactLines.some(line => isBulletLine(line) || isLikelyDateLine(line))
      const prefersTags = /(coursework|stack|tools|toolkit|domains|competencies|strengths|expertise)/i.test(titleLower)
      const prefersComplex = /(leadership|affiliations?|organizations?|memberships?|involvement|activities|engagement|training)/i.test(titleLower)

      if (hasComplexSignals || prefersComplex) {
        const items = parseJobLines(compactLines)
        if (items.length > 0) {
          return {
            id: `custom_${index + 1}`,
            title,
            type: 'complex' as const,
            items,
          }
        }
      }

      const tagCandidates = compactLines
        .join('\n')
        .split(/[,\n|•]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length <= 40)

      if ((prefersTags && tagCandidates.length >= 1) || (tagCandidates.length >= 2 && compactLines.length <= 5)) {
        return {
          id: `custom_${index + 1}`,
          title,
          type: 'tags' as const,
          tags: Array.from(new Set(tagCandidates)),
        }
      }

      return {
        id: `custom_${index + 1}`,
        title,
        type: 'text' as const,
        text: compactLines.join(' ').trim(),
      }
    })
}

// ─── Shared result builder ────────────────────────────────────────────────────

function buildResumeData(
  sections: Record<string, string[]>,
  name: string,
  email: string,
  phone: string,
  location: string,
  linkedin: string,
  website: string
): ResumeData {
  const experience = parseExperience(sections['experience'] ?? [])
  const customSections = buildCustomSections(sections)
  const currentRole = experience[0]?.title ?? extractCurrentRoleFromPreamble(sections['preamble'] ?? [], name)

  return syncResumeData({
    name,
    email,
    phone,
    location,
    linkedin,
    website,
    currentRole,
    summary: parseSummary(sections['summary'] ?? [], sections['preamble'] ?? [], name, currentRole),
    experience,
    education: parseEducation(sections['education'] ?? []),
    skills: parseSkills(sections['skills'] ?? []),
    skillSections: parseSkillSections(sections['skills'] ?? []),
    certifications: parseCertifications(sections['certifications'] ?? []),
    projects: parseProjects(sections['projects'] ?? []),
    languages: parseLanguages(sections['languages'] ?? []),
    volunteer: parseVolunteer(sections['volunteer'] ?? []),
    interests: parseInterests(sections['interests'] ?? []),
    awards: parseAwards(sections['awards'] ?? []),
    publications: parsePublications(sections['publications'] ?? []),
    references: parseReferences(sections['references'] ?? []),
    customSections,
  })
}

// ─── Primary export: spatial parser ──────────────────────────────────────────

export async function parseResumeFromPages(pages: ExtractedPage[]): Promise<ResumeData> {
  const lines = pagesToLines(pages)

  if (lines.length === 0) return emptyResume()

  const fontSizes = lines.map(l => l.fontSize).filter(s => s > 0)
  const sorted = [...fontSizes].sort((a, b) => a - b)
  const medianFontSize = sorted[Math.floor(sorted.length / 2)] ?? 11

  const fullText = lines.map(l => l.text).join('\n')
  const email = extractEmail(fullText)
  const phone = extractPhone(fullText)
  const linkedin = extractLinkedIn(fullText)
  const website = extractWebsite(fullText)
  const name = extractNameFromLines(lines, email, phone, medianFontSize)

  const location = (() => {
    for (const l of lines.slice(0, 10)) {
      const m = LOCATION_RE.exec(l.text)
      if (m) return m[0]
    }
    return ''
  })()

  const sections = splitStructuredLines(lines, medianFontSize)
  const result = buildResumeData(sections, name, email, phone, location, linkedin, website)

  const populated = [result.name, result.email, result.experience.length > 0, result.education.length > 0, result.skills.length > 0].filter(Boolean).length
  if (populated < 2) console.warn('Low confidence parse:', populated, 'fields populated')

  return result
}

// ─── Fallback export: text parser (for DOCX) ─────────────────────────────────

export async function parseResumeText(rawText: string): Promise<ResumeData> {
  const text = normalise(rawText)
  const lines = text.split('\n')

  const sections: Record<string, string[]> = { preamble: [] }
  let current = 'preamble'
  let hasStartedSectionFlow = false
  for (const line of lines) {
    const trimmedLine = line.trim()
    const section = detectSection(trimmedLine)
    if (section) {
      current = section
      sections[current] = sections[current] ?? []
      hasStartedSectionFlow = true
    } else if (hasStartedSectionFlow && looksLikeCustomHeadingText(trimmedLine)) {
      current = buildCustomSectionKey(normalizeHeading(trimmedLine))
      sections[current] = sections[current] ?? []
    } else {
      sections[current] = sections[current] ?? []
      sections[current].push(line)
    }
  }

  const preamble = sections['preamble'] ?? []
  const email = extractEmail(text)
  const phone = extractPhone(text)
  const linkedin = extractLinkedIn(text)
  const website = extractWebsite(text)

  const name = (() => {
    for (const line of lines.slice(0, 8)) {
      const t = line.trim()
      if (!t || t === email || PHONE_RE.test(t) || URL_RE.test(t)) continue
      if (t.length < 2 || t.length > 50 || !t.includes(' ') || EMAIL_RE.test(t)) continue
      const words = t.split(/\s+/)
      if (words.length >= 2 && words.length <= 5 && words.every(w => /^[\p{L}\p{M}'-]+$/u.test(w))) return t
    }
    return ''
  })()

  const location = (() => {
    for (const l of preamble) {
      const m = LOCATION_RE.exec(l)
      if (m) return m[0]
    }
    return ''
  })()

  return buildResumeData(sections, name, email, phone, location, linkedin, website)
}

function emptyResume(): ResumeData {
  return {
    name: '', email: '', phone: '', location: '', linkedin: '', website: '',
    summary: '', currentRole: '', experience: [], education: [], skills: [], skillSections: [],
    certifications: [], projects: [], languages: [],
    volunteer: [], interests: [], awards: [], publications: [], references: [], customSections: [],
  }
}

// ─── Template adapter ─────────────────────────────────────────────────────────
