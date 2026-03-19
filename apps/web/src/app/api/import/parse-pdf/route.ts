import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { extractTextFromPDF } from "@/lib/pdf-ocr";

// Regex patterns - include soft hyphen (U+00AD) used by some PDF generators
const HYPH = "[-\\u00AD]"; // regular hyphen or soft hyphen
const CPF_PATTERN = `\\d{3}\\.\\d{3}\\.\\d{3}${HYPH}\\d{2}`;
const CNPJ_PATTERN = `\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}${HYPH}\\d{2}`;
const CPF_RE = new RegExp(CPF_PATTERN);
const CNPJ_RE = new RegExp(CNPJ_PATTERN);
const DOC_RE = new RegExp(`(${CNPJ_PATTERN}|${CPF_PATTERN})`);
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const PHONE_RE = new RegExp(`\\(?\\d{2}\\)?\\s*\\d{4,5}${HYPH}\\d{4}`);

// Address prefixes to detect where name ends and address begins
const ADDRESS_PREFIXES = [
  "Rua ", "Av ", "Av. ", "Avenida ", "Alameda ", "Travessa ", "Tv. ",
  "Estrada ", "Rodovia ", "Rod. ", "Praça ", "Largo ", "Beco ", "Viela ",
  "Corredor ", "Linha ", "Rincão ",
];

export const maxDuration = 300;

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
    const text = await extractTextFromPDF(buffer);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "PDF vazio ou sem texto extraivel" }, { status: 400 });
    }

    const rows = parseReportPdf(text);

    if (rows.length === 0) {
      return NextResponse.json({
        error: "Nao foi possivel extrair dados tabulares do PDF. Verifique se o PDF contem uma tabela.",
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
 * The text from pdf-parse comes with columns concatenated (no separators).
 * Example line: "Adair SeeligRua João Baumhardt  538  626.363.830­34adair.seelig@gmail.com"
 *
 * Strategy:
 * 1. Find CPF or CNPJ in the line (anchors the split)
 * 2. Everything before the doc = name + address (split by address prefix)
 * 3. Everything after the doc = email + phone (extract by regex)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseReportPdf(text: string): Record<string, any>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];

  for (const line of lines) {
    // Skip headers, footers, page numbers, totals
    if (/^P[áa]gina\s+\d/i.test(line)) continue;
    if (/^Rela[çc][ãa]o\s+de/i.test(line)) continue;
    if (/^Total\s*\[/i.test(line)) continue;
    if (/^PV\d+/i.test(line)) continue;
    if (/Locat[áa]rio.*Endere[çc]o.*CPF/i.test(line)) continue;
    if (/Propriet[áa]rio.*Endere[çc]o.*CPF/i.test(line)) continue;
    if (line.length < 15) continue;

    // Step 1: Find CPF or CNPJ
    const docMatch = line.match(DOC_RE);
    if (!docMatch || docMatch.index === undefined) continue;

    const docValue = docMatch[0].replace(/\u00AD/g, "-"); // normalize soft hyphens
    const docIndex = docMatch.index;
    const docEnd = docIndex + docMatch[0].length;

    // Step 2: Split before/after document
    const beforeDoc = line.substring(0, docIndex).trim();
    const afterDoc = line.substring(docEnd);

    // Step 3: Extract email from afterDoc (it's glued right after the CPF digits)
    const emailMatch = afterDoc.match(EMAIL_RE);
    let email = "";
    if (emailMatch) {
      email = emailMatch[0];
      // Check if there are multiple emails (comma separated in the remaining text)
      const afterEmail = afterDoc.substring(afterDoc.indexOf(email) + email.length);
      const moreEmails = afterEmail.match(EMAIL_RE);
      if (moreEmails) {
        email = email + ", " + moreEmails[0];
      }
    }

    // Step 4: Extract phone from afterDoc
    const phoneMatch = afterDoc.match(PHONE_RE);
    let phone = "";
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/\u00AD/g, "-");
    }
    // Also check for simple phone patterns like "51 996643809"
    if (!phone) {
      const simplePhone = afterDoc.match(/\d{2}\s+\d{8,9}/);
      if (simplePhone) {
        phone = simplePhone[0];
      }
    }

    // Step 5: Split name and address from beforeDoc
    // pdf-parse concatenates name + address without spaces, e.g.:
    // "Adair SeeligRua João Baumhardt  538" or "EDILAMAR SILVAAvenida ..."
    // Find address keyword and split there
    let name = beforeDoc;
    let endereco = "";

    const ADDR_KW = /(?:Rua|Avenida|Av\.|Av |Alameda|Travessa|Tv\.|Estrada|Rodovia|Rod\.|Corredor|Linha|Rincão|Praça|Tenente|General|Gerenal|Marechal|Presidente|Pres\.|Gaspar|Milton|Felix|Albano|Casemiro|Fernando|Gonçalves|Galvão|Juca|Osvaldo|Emílio|Encantado|LIberato|Liberato|Leo |Léo )/g;

    let bestAddrIndex = -1;
    let kwMatch;
    while ((kwMatch = ADDR_KW.exec(beforeDoc)) !== null) {
      const idx = kwMatch.index;
      if (idx > 3) {
        bestAddrIndex = idx;
        break;
      }
    }

    if (bestAddrIndex > 0) {
      name = beforeDoc.substring(0, bestAddrIndex).trim();
      endereco = beforeDoc.substring(bestAddrIndex).trim();
    } else {
      // No address keyword found - try splitting by double space
      const dblSpace = beforeDoc.search(/\s{2,}/);
      if (dblSpace > 3) {
        name = beforeDoc.substring(0, dblSpace).trim();
        endereco = beforeDoc.substring(dblSpace).trim();
      }
    }

    // Clean name: remove leading numeric codes like "26.581.862"
    name = name.replace(/^\d[\d.]+\s+/, "").trim();

    // Skip empty names
    if (!name || name.length < 2) continue;

    // Clean endereco: remove trailing spaces
    endereco = endereco.replace(/\s{2,}/g, " ").trim();

    rows.push({
      nome: name,
      endereco: endereco,
      cpf_cnpj: docValue,
      telefone: phone,
      email: email,
    });
  }

  return rows;
}
