import type { ResumeData } from '../types'

export interface ResumeParser {
  parse(buffer: Buffer, fileType: string): Promise<ResumeData>
}

export class ParseError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code)
    this.name = 'ParseError'
  }
}
