import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import pdfParse from "pdf-parse";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo muito grande. Maximo 20MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdf = await pdfParse(buffer);
    const text = pdf.text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "PDF vazio ou sem texto extraivel" }, { status: 400 });
    }

    // Parse text into rows - try to detect tabular structure
    const rows = parseTextToRows(text);

    if (rows.length === 0) {
      return NextResponse.json({
        error: "Nao foi possivel extrair dados tabulares do PDF. Verifique se o PDF contem uma tabela com cabecalhos.",
      }, { status: 400 });
    }

    return NextResponse.json({ rows, totalLines: rows.length });
  } catch (error) {
    console.error("PDF parse error:", error);
    return NextResponse.json(
      { error: "Erro ao processar o PDF. Verifique se o arquivo e valido." },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTextToRows(text: string): Record<string, any>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Strategy 1: Try tab-separated
  const tabSep = tryDelimiter(lines, "\t");
  if (tabSep.length > 0) return tabSep;

  // Strategy 2: Try semicolon-separated (common in BR exports)
  const semiSep = tryDelimiter(lines, ";");
  if (semiSep.length > 0) return semiSep;

  // Strategy 3: Try pipe-separated
  const pipeSep = tryDelimiter(lines, "|");
  if (pipeSep.length > 0) return pipeSep;

  // Strategy 4: Try comma-separated
  const commaSep = tryDelimiter(lines, ",");
  if (commaSep.length > 0) return commaSep;

  // Strategy 5: Try to detect columns by multiple spaces (fixed-width tables)
  const fixedWidth = tryFixedWidth(lines);
  if (fixedWidth.length > 0) return fixedWidth;

  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryDelimiter(lines: string[], delimiter: string): Record<string, any>[] {
  // Check if header line has the delimiter
  const headerParts = lines[0].split(delimiter).map((p) => p.trim()).filter((p) => p.length > 0);

  // Need at least 2 columns to be a valid table
  if (headerParts.length < 2) return [];

  // Check that at least 30% of data lines have similar column count
  let matchCount = 0;
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    // Allow some flexibility in column count (+/- 1)
    if (Math.abs(parts.length - headerParts.length) <= 1) {
      matchCount++;
    }
  }

  const dataLines = Math.min(lines.length - 1, 19);
  if (dataLines > 0 && matchCount / dataLines < 0.3) return [];

  // Parse all rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    for (let j = 0; j < headerParts.length; j++) {
      row[headerParts[j]] = parts[j] ?? "";
    }
    // Skip completely empty rows
    if (Object.values(row).some((v) => v !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryFixedWidth(lines: string[]): Record<string, any>[] {
  // Detect column boundaries by finding positions where multiple spaces appear consistently
  const headerLine = lines[0];

  // Find positions with 2+ spaces in header
  const gaps: number[] = [];
  for (let i = 0; i < headerLine.length - 1; i++) {
    if (headerLine[i] === " " && headerLine[i + 1] === " ") {
      // Find the end of the gap
      let end = i + 1;
      while (end < headerLine.length && headerLine[end] === " ") end++;
      if (!gaps.includes(i)) gaps.push(i);
      i = end - 1;
    }
  }

  if (gaps.length < 1) return [];

  // Build column boundaries: [start, end]
  const boundaries: [number, number][] = [];
  let start = 0;
  for (const gap of gaps) {
    boundaries.push([start, gap]);
    // Find where next column starts
    let nextStart = gap;
    while (nextStart < headerLine.length && headerLine[nextStart] === " ") nextStart++;
    start = nextStart;
  }
  // Last column
  boundaries.push([start, Math.max(...lines.map((l) => l.length))]);

  // Extract headers
  const headers = boundaries.map(([s, e]) => headerLine.substring(s, e).trim()).filter((h) => h.length > 0);

  if (headers.length < 2) return [];

  // Extract data rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    for (let j = 0; j < boundaries.length && j < headers.length; j++) {
      const [s, e] = boundaries[j];
      row[headers[j]] = (line.substring(s, Math.min(e, line.length)) || "").trim();
    }
    if (Object.values(row).some((v) => v !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
