import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

// Polyfill DOMMatrix for Node.js (required by pdfjs-dist used internally by pdf-parse)
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error minimal polyfill for pdf text extraction only
  globalThis.DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true; isIdentity = true;
    inverse() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    static fromMatrix() { return new DOMMatrix(); }
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
  };
}

// pdf-parse is CommonJS, use dynamic require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

// Regex patterns for Brazilian document fields
const CPF_RE = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g;
const CNPJ_RE = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g;
const PHONE_RE = /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/g;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/g;

// Address prefixes to detect where name ends and address begins
const ADDRESS_PREFIXES = /\b(Rua|R\.|Av\.?|Avenida|Alameda|Travessa|Tv\.|Estrada|Rodovia|Rod\.|Praça|Largo|Beco|Viela|Corredor|Linha|Rincão|Galvão|Gonçalves|Gaspar|Presidente|Pres\.|Marechal|Tenente|General|Gerenal|Milton|Felix|Albano|Casemiro|Fernando|Liberato|Juca|Osvaldo|Vinte|Onze|Encantado|Emílio|LIberato)\b/;

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

    // Try smart report parsing first, then fallback to generic
    let rows = parseReportPdf(text);

    if (rows.length === 0) {
      rows = parseGenericPdf(text);
    }

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

/**
 * Smart parser for Brazilian property management report PDFs.
 * Detects CPF, CNPJ, phone, and email patterns to split lines into structured data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseReportPdf(text: string): Record<string, any>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Detect report type by looking for known header keywords
  const headerKeywords = {
    locatarios: /Locat[áa]rio|Inquilino/i,
    proprietarios: /Propriet[áa]rio|Locador/i,
    imoveis: /Im[óo]vel|Im[óo]veis|Propriedade/i,
    contratos: /Contrato/i,
  };

  let reportType: string | null = null;
  for (const [type, regex] of Object.entries(headerKeywords)) {
    if (lines.some((l) => regex.test(l))) {
      reportType = type;
      break;
    }
  }

  if (!reportType) return [];

  // Find where data starts (skip headers, title, page numbers)
  const headerLine = lines.findIndex((l) =>
    /Locat[áa]rio|Propriet[áa]rio|Im[óo]vel/i.test(l) &&
    /Endere[çc]o|CPF|CNPJ|E-?mail/i.test(l)
  );

  if (headerLine === -1) {
    // No formal header, try to parse each line with patterns
    return parseLinesByPatterns(lines, reportType);
  }

  // Parse lines after header
  const dataLines = lines.slice(headerLine + 1);
  return parseLinesByPatterns(dataLines, reportType);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLinesByPatterns(lines: string[], reportType: string): Record<string, any>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];

  for (const line of lines) {
    // Skip page headers, footers, totals
    if (/^P[áa]gina\s+\d/i.test(line)) continue;
    if (/^Rela[çc][ãa]o\s+de/i.test(line)) continue;
    if (/^Total\s*\[/i.test(line)) continue;
    if (/^PV\d+/i.test(line)) continue;
    if (/^Locat[áa]rio\s+Endere[çc]o/i.test(line)) continue;
    if (/^Propriet[áa]rio\s+Endere[çc]o/i.test(line)) continue;
    if (line.length < 10) continue;

    // Extract all patterns from the line
    const cpfs = [...line.matchAll(CPF_RE)].map((m) => m[0]);
    const cnpjs = [...line.matchAll(CNPJ_RE)].map((m) => m[0]);
    const phones = [...line.matchAll(PHONE_RE)].map((m) => m[0]);
    const emails = [...line.matchAll(EMAIL_RE)].map((m) => m[0]);

    // Must have at least a CPF or CNPJ to be a valid data line
    // (some lines might have only email for continuation - skip those)
    if (cpfs.length === 0 && cnpjs.length === 0) continue;

    // Determine CPF vs CNPJ
    // CNPJ has /0001- pattern; CPF values that look like CNPJ need filtering
    const realCnpjs = cnpjs.filter((c) => c.includes("/"));
    const realCpfs = cpfs.filter((c) => {
      // Exclude CPFs that are part of a CNPJ
      return !realCnpjs.some((cnpj) => cnpj.includes(c.replace(/[-.\s]/g, "")));
    });

    // Extract the document (CPF or CNPJ)
    let cpfCnpj = "";
    if (realCnpjs.length > 0) {
      cpfCnpj = realCnpjs[0];
    } else if (realCpfs.length > 0) {
      cpfCnpj = realCpfs[0];
    }

    // Find where the document number starts in the line to split name+address from the rest
    const docIndex = cpfCnpj ? line.indexOf(cpfCnpj) : -1;
    const beforeDoc = docIndex > 0 ? line.substring(0, docIndex).trim() : line;

    // Split name and address using address prefix detection
    let name = beforeDoc;
    let endereco = "";

    const addressMatch = beforeDoc.match(ADDRESS_PREFIXES);
    if (addressMatch && addressMatch.index !== undefined && addressMatch.index > 3) {
      name = beforeDoc.substring(0, addressMatch.index).trim();
      endereco = beforeDoc.substring(addressMatch.index).trim();
    }

    // Clean name: remove leading numeric codes like "26.581.862"
    name = name.replace(/^\d[\d.]+\s+/, "").trim();

    // Skip if no name
    if (!name || name.length < 2) continue;

    // Build row based on report type
    if (reportType === "locatarios" || reportType === "proprietarios") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = {
        nome: name,
        endereco: endereco || "",
        cpf_cnpj: cpfCnpj,
        telefone: phones[0] || "",
        email: emails[0] || "",
      };

      // If there are multiple phones, second one is "comercial"
      if (phones.length > 1) {
        row.telefone_comercial = phones[1];
      }

      // Multiple emails
      if (emails.length > 1) {
        row.email = emails.join(", ");
      }

      rows.push(row);
    } else {
      // Generic row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = {
        nome: name,
        endereco: endereco || "",
        cpf_cnpj: cpfCnpj,
        telefone: phones[0] || "",
        email: emails[0] || "",
      };
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Generic parser for structured PDFs (CSV-like, tab-separated, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGenericPdf(text: string): Record<string, any>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Try common delimiters
  for (const delimiter of ["\t", ";", "|", ","]) {
    const result = tryDelimiter(lines, delimiter);
    if (result.length > 0) return result;
  }

  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryDelimiter(lines: string[], delimiter: string): Record<string, any>[] {
  const headerParts = lines[0].split(delimiter).map((p) => p.trim()).filter((p) => p.length > 0);
  if (headerParts.length < 2) return [];

  let matchCount = 0;
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    if (Math.abs(parts.length - headerParts.length) <= 1) {
      matchCount++;
    }
  }

  const dataLines = Math.min(lines.length - 1, 19);
  if (dataLines > 0 && matchCount / dataLines < 0.3) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    for (let j = 0; j < headerParts.length; j++) {
      row[headerParts[j]] = parts[j] ?? "";
    }
    if (Object.values(row).some((v) => v !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
