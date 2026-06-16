import type { ResumeData } from '../types'
import type { ResumeParser } from './types'
import { extractPDFItems } from '../pdfExtractor'
import { extractDocxText } from '../docxTextExtractor'
import { parseResumeFromPages, parseResumeText } from '../resumeParser'

const pdfjsParser: ResumeParser = {
  async parse(buffer: Buffer, fileType: string): Promise<ResumeData> {
    if (fileType === 'application/pdf') {
      const pages = await extractPDFItems(buffer)
      return parseResumeFromPages(pages)
    }

    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const text = await extractDocxText(buffer)
      return parseResumeText(text)
    }

    // Plain text fallback
    return parseResumeText(buffer.toString('utf-8'))
  },
}

export default pdfjsParser
