import { execFile } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

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
    if (jpeg.length > 10000) {
      jpegs.push(Buffer.from(jpeg));
    }

    offset = end + 2;
  }

  return jpegs;
}

/**
 * Run tesseract CLI on an image file and return the extracted text.
 */
function runTesseract(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputBase = imagePath + "_out";
    execFile(
      "tesseract",
      [imagePath, outputBase, "-l", "por", "--psm", "1"],
      { timeout: 60000 },
      async (error) => {
        if (error) {
          reject(new Error(`Tesseract falhou: ${error.message}`));
          return;
        }
        try {
          const { readFile } = await import("fs/promises");
          const text = await readFile(outputBase + ".txt", "utf-8");
          // Clean up output file
          await unlink(outputBase + ".txt").catch(() => {});
          resolve(text);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Extract text from a scanned PDF using system tesseract-ocr.
 * Finds embedded JPEG images and runs tesseract CLI on each.
 */
export async function extractTextWithOCR(pdfBuffer: Buffer): Promise<string> {
  const jpegs = findJpegStreams(pdfBuffer);

  if (jpegs.length === 0) {
    throw new Error("Nenhuma imagem encontrada no PDF escaneado");
  }

  const tempDir = join(tmpdir(), "somma-ocr-" + randomUUID());
  await mkdir(tempDir, { recursive: true });

  const texts: string[] = [];

  // Process max 15 pages to avoid timeout
  for (let i = 0; i < Math.min(jpegs.length, 15); i++) {
    const imgPath = join(tempDir, `page-${i}.jpg`);
    try {
      await writeFile(imgPath, jpegs[i]);
      const text = await runTesseract(imgPath);
      if (text.trim().length > 10) {
        texts.push(text);
      }
    } catch {
      // Skip unreadable images
    } finally {
      await unlink(imgPath).catch(() => {});
    }
  }

  // Clean up temp dir
  const { rmdir } = await import("fs/promises");
  await rmdir(tempDir).catch(() => {});

  if (texts.length === 0) {
    throw new Error("Nao foi possivel extrair texto do PDF escaneado. Verifique se o tesseract-ocr esta instalado.");
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

    if (text.length > 50) {
      return text;
    }
  } catch {
    // pdf-parse failed, will try OCR
  }

  // Fall back to OCR for scanned PDFs
  return extractTextWithOCR(pdfBuffer);
}
