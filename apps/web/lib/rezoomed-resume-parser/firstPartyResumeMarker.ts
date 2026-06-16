import { syncResumeData } from './resume-data'
import type { ResumeData } from './types'

const MARKER_VERSION = 1
const MARKER_FIELDS = ['keywords', 'subject', 'creator'] as const
const MARKER_PREFIX = 'x1'

type ResumeMarkerPayload = {
  v: number
  d: Partial<ResumeData>
  c?: unknown
  s?: unknown
  b?: unknown
}

export interface FirstPartyResumeSnapshot {
  data: ResumeData
  config: unknown | null
  sectionOrder: string[]
  sidebarSectionOrder: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4
  return Uint8Array.from(Buffer.from(normalized + '='.repeat(paddingLength), 'base64'))
}

function deserializePayload(encoded: string): ResumeMarkerPayload | null {
  try {
    const raw = new TextDecoder().decode(base64UrlToBytes(encoded))
    const parsed = JSON.parse(raw) as Partial<ResumeMarkerPayload>

    if (!isRecord(parsed) || parsed.v !== MARKER_VERSION || !isRecord(parsed.d)) {
      return null
    }

    return {
      v: MARKER_VERSION,
      d: parsed.d as Partial<ResumeData>,
      c: parsed.c ?? null,
      s: parsed.s,
      b: parsed.b,
    }
  } catch {
    return null
  }
}

function decodeChunk(value: string): { index: number; total: number; chunk: string } | null {
  const match = value.match(/^([a-z0-9]+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/i)
  if (!match || match[1] !== MARKER_PREFIX) return null

  const index = Number(match[2])
  const total = Number(match[3])
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
    return null
  }

  const chunk = match[4]
  if (!chunk) return null

  return {
    index,
    total,
    chunk,
  }
}

function getMetadataValue(source: unknown, key: string): string | null {
  if (!source) return null

  if (isRecord(source)) {
    const direct = source[key]
    if (typeof direct === 'string' && direct.trim()) return direct.trim()
    if (Array.isArray(direct)) {
      const value = direct.filter((item): item is string => typeof item === 'string').join(',')
      if (value.trim()) return value.trim()
    }

    const foundKey = Object.keys(source).find((entry) => entry.toLowerCase() === key.toLowerCase())
    if (foundKey) {
      const value = source[foundKey]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (Array.isArray(value)) {
        const joined = value.filter((item): item is string => typeof item === 'string').join(',')
        if (joined.trim()) return joined.trim()
      }
    }
  }

  if (
    typeof source === 'object' &&
    source !== null &&
    'get' in source &&
    typeof (source as { get?: unknown }).get === 'function'
  ) {
    const value = (source as { get: (name: string) => unknown }).get(key)
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const joined = value.filter((item): item is string => typeof item === 'string').join(',')
      if (joined.trim()) return joined.trim()
    }
  }

  return null
}

function candidateValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function decodeFirstPartyResumeMetadata(source: { info?: unknown; metadata?: unknown } | null | undefined) {
  if (!source) return null

  const foundChunks = MARKER_FIELDS
    .flatMap((field) => {
      const value = getMetadataValue(source.info, field) ?? getMetadataValue(source.metadata, field)
      return value ? candidateValues(value) : []
    })
    .map(decodeChunk)
    .filter((value): value is { index: number; total: number; chunk: string } => Boolean(value))

  if (foundChunks.length === 0) return null

  const firstChunk = foundChunks[0]
  if (!firstChunk) return null
  const total = firstChunk.total
  if (foundChunks.length !== total || foundChunks.some((chunk) => chunk.total !== total)) return null

  const ordered = [...foundChunks].sort((left, right) => left.index - right.index)
  if (ordered.some((chunk, index) => chunk.index !== index + 1)) return null

  const payload = deserializePayload(ordered.map((chunk) => chunk.chunk).join(''))
  if (!payload) return null

  return {
    data: syncResumeData({
      ...payload.d,
      experience: Array.isArray(payload.d.experience) ? payload.d.experience : [],
      education: Array.isArray(payload.d.education) ? payload.d.education : [],
      skills: Array.isArray(payload.d.skills) ? payload.d.skills : [],
      skillSections: Array.isArray(payload.d.skillSections) ? payload.d.skillSections : [],
      certifications: Array.isArray(payload.d.certifications) ? payload.d.certifications : [],
      projects: Array.isArray(payload.d.projects) ? payload.d.projects : [],
      languages: Array.isArray(payload.d.languages) ? payload.d.languages : [],
      volunteer: Array.isArray(payload.d.volunteer) ? payload.d.volunteer : [],
      interests: Array.isArray(payload.d.interests) ? payload.d.interests : [],
      awards: Array.isArray(payload.d.awards) ? payload.d.awards : [],
      publications: Array.isArray(payload.d.publications) ? payload.d.publications : [],
      references: Array.isArray(payload.d.references) ? payload.d.references : [],
      customSections: Array.isArray(payload.d.customSections) ? payload.d.customSections : [],
    }),
    config: payload.c ?? null,
    sectionOrder: stringArray(payload.s),
    sidebarSectionOrder: stringArray(payload.b),
  } satisfies FirstPartyResumeSnapshot
}
