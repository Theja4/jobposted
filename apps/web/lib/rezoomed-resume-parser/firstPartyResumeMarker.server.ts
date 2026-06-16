import { decodeFirstPartyResumeMetadata, type FirstPartyResumeSnapshot } from './firstPartyResumeMarker'
import { extractPDFMetadata } from './pdfExtractor'

async function extractPdfLibMetadata(buffer: Buffer) {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
  return {
    info: {
      subject: pdf.getSubject() ?? '',
      keywords: pdf.getKeywords() ?? [],
      creator: pdf.getCreator() ?? '',
    },
    metadata: null,
  }
}

export async function extractFirstPartyResumeSnapshotFromPdf(buffer: Buffer): Promise<FirstPartyResumeSnapshot | null> {
  try {
    const metadata = await extractPDFMetadata(buffer)
    const decoded = decodeFirstPartyResumeMetadata(metadata)
    if (decoded) return decoded
  } catch {
    // Fall through to pdf-lib. Metadata should not depend on text extraction.
  }

  try {
    return decodeFirstPartyResumeMetadata(await extractPdfLibMetadata(buffer))
  } catch {
    return null
  }
}
