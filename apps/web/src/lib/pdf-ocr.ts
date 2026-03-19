import Tesseract from "tesseract.js";

/**
 * Find JPEG image streams embedded in a PDF buffer.
 * Scanned PDFs (especially from iPhone/Notes) embed JPEG images directly.
 */
function findJpegStreams(buffer: Buffer): Buffer[] {
  const jpegs: Buffer[] = [];
  const SOI = Buffer.from([0xFF, 0xD8]); // JPEG Start of Image
  const EOI = Buffer.from([0xFF, 0xD9]); // JPEG End of Image

  let offset = 0;
  while (offset < buffer.length - 2) {
    const start = buffer.indexOf(SOI, offset);
    if (start === -1) break;

    const end = buffer.indexOf(EOI, start + 2);
    if (end === -1) break;

    const jpeg = buffer.subarray(start, end + 2);
    // Only include reasonably sized images (> 10KB, likely a page scan)
    if (jpeg.length > 10000) {
      jpegs.push(Buffer.from(jpeg));
    }

    offset = end + 2;
  }

  return jpegs;
}

/**
 * Extract text from a scanned PDF using OCR.
 * Finds embedded JPEG images and runs Tesseract OCR on each.
 */
export async function extractTextWithOCR(pdfBuffer: Buffer): Promise<string> {
  const jpegs = findJpegStreams(pdfBuffer);

  if (jpegs.length === 0) {
    throw new Error("Nenhuma imagem encontrada no PDF escaneado");
  }

  const texts: string[] = [];

  // Process max 15 pages to avoid timeout
  for (const jpeg of jpegs.slice(0, 15)) {
    try {
      const { data } = await Tesseract.recognize(jpeg, "por");
      if (data.text && data.text.trim().length > 10) {
        texts.push(data.text);
      }
    } catch {
      // Skip unreadable images
    }
  }

  if (texts.length === 0) {
    throw new Error("Nao foi possivel extrair texto do PDF escaneado");
  }

  return texts.join("\n\n");
}

/**
 * Try pdf-parse first, fall back to OCR if text is empty.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  // First try pdf-parse (fast, works for digital PDFs)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(pdfBuffer);
    const text = (result.text || "").trim();

    // If we got meaningful text (more than just whitespace/newlines)
    if (text.length > 50) {
      return text;
    }
  } catch {
    // pdf-parse failed, will try OCR
  }

  // Fall back to OCR for scanned PDFs
  return extractTextWithOCR(pdfBuffer);
}
