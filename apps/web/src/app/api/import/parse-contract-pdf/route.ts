import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import fs from "fs/promises";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function parseMonthDate(day: string, month: string, year: string): Date | null {
  const m = MONTHS[month.toLowerCase()];
  if (!m) return null;
  return new Date(parseInt(year), m - 1, parseInt(day));
}

function parseValor(str: string): number | null {
  if (!str) return null;
  const clean = str.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function cleanCpfCnpj(value: string): string {
  return value.replace(/[.\-\/\s]/g, "").trim();
}

interface ParsedContract {
  locatarioNome: string | null;
  locatarioCpf: string | null;
  proprietarioNome: string | null;
  proprietarioCpfCnpj: string | null;
  imovelDescricao: string | null;
  valorAluguel: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  diaPagamento: number | null;
  garantia: string | null;
  reajuste: string | null;
  fileName: string;
}

function extractContractData(text: string, fileName: string): ParsedContract {
  const t = text.replace(/\s+/g, " ");

  // Locatario name - try multiple patterns
  let locName: string | null = null;
  const locMatch = t.match(
    /LOCAT[ÁA]RIO[S]?(?:\(A\))?:\s*(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|portador|solteiro|casad|viúv|divorc|menor|maior|natural))/i
  );
  if (locMatch) locName = locMatch[1].trim();

  // Locatario CPF - search in the LOCATARIO section (before FIADOR or IMOVEL)
  let locCpf: string | null = null;
  const locSection = t.match(/LOCAT[ÁA]RIO.*?(?:FIADOR|IM[ÓO]VEL|OBJETO)/is);
  if (locSection) {
    const cpfMatch = locSection[0].match(/(?:CPF|CPF\/MF)\s*(?:n[°ºo]|sob\s*n[°ºo])?\s*(\d{3}\.?\d{3}\.?\d{3}[\-]\d{2})/i);
    if (cpfMatch) locCpf = cpfMatch[1];
  }

  // Proprietario - search between PROPRIETARIO and LOCATARIO
  let propName: string | null = null;
  let propDoc: string | null = null;
  const propStart = t.search(/PROPRIET[ÁA]RIO/i);
  const locStart = t.search(/LOCAT[ÁA]RIO/i);
  if (propStart >= 0 && locStart > propStart) {
    const propSection = t.substring(propStart, locStart);

    // Name
    const pn = propSection.match(
      /PROPRIET[ÁA]RIO.*?:\s*(.+?)(?:,\s*(?:brasileir|pessoa|empresa\s*jur|inscrit|com sede|portador|solteiro|casad))/i
    );
    if (pn) propName = pn[1].trim();

    // CNPJ (first one, skip Somma's 40.528.068/0001-62)
    const cnpjs = [...propSection.matchAll(/(\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2})/g)];
    const sommaClean = "40528068000162";
    for (const c of cnpjs) {
      if (cleanCpfCnpj(c[1]) !== sommaClean) {
        propDoc = c[1];
        break;
      }
    }
    // If no CNPJ found, try CPF
    if (!propDoc) {
      const cpfMatch = propSection.match(/(?:CPF)\s*(?:n[°ºo]|sob\s*n[°ºo])?\s*(\d{3}\.?\d{3}\.?\d{3}[\-]\d{2})/i);
      if (cpfMatch && cleanCpfCnpj(cpfMatch[1]) !== sommaClean) {
        propDoc = cpfMatch[1];
      }
    }
  }

  // Imovel
  let imovelDesc: string | null = null;
  const imMatch = t.match(
    /IM[ÓO]VEL\s+OBJETO\s+DA\s+LOCA[ÇC][ÃA]O:\s*(.+?)(?:FINALIDADE|\.(?:\s|$))/i
  );
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  // Prazo
  let dataInicio: string | null = null;
  let dataFim: string | null = null;
  const prazoMatch = t.match(
    /in[íi]cio\s+em\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}).*?t[eé]rmin?o\s+em\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i
  );
  if (prazoMatch) {
    const di = parseMonthDate(prazoMatch[1], prazoMatch[2], prazoMatch[3]);
    const df = parseMonthDate(prazoMatch[4], prazoMatch[5], prazoMatch[6]);
    if (di) dataInicio = di.toISOString();
    if (df) dataFim = df.toISOString();
  }

  // Valor
  let valorAluguel: number | null = null;
  const valorMatch = t.match(
    /(?:VALOR\s+(?:DO\s+)?ALUGUEL|valor\s+mensal\s+do\s+aluguel).*?R\$\s*([\d.,]+)/i
  );
  if (valorMatch) valorAluguel = parseValor(valorMatch[1]);

  // Dia pagamento
  let diaPgto: number | null = null;
  const diaMatch = t.match(/NO\s+DIA\s+(\d+)\s*\(/i);
  if (diaMatch) diaPgto = parseInt(diaMatch[1]);

  // Garantia
  let garantia: string | null = null;
  if (/FIADOR:/i.test(t)) garantia = "FIADOR";
  else if (/seguro.{0,10}fian[çc]a/i.test(t)) garantia = "SEGURO_FIANCA";
  else if (/cau[çc][ãa]o/i.test(t)) garantia = "CAUCAO";
  else if (/t[ií]tulo.{0,10}capitaliza/i.test(t)) garantia = "TITULO_CAPITALIZACAO";

  // Reajuste
  let reajuste: string | null = null;
  if (/IGPM|IGP-M/i.test(t)) reajuste = "IGPM";
  else if (/IPCA|IPC-A/i.test(t)) reajuste = "IPCA";
  else if (/INPC/i.test(t)) reajuste = "INPC";

  return {
    locatarioNome: locName,
    locatarioCpf: locCpf,
    proprietarioNome: propName,
    proprietarioCpfCnpj: propDoc,
    imovelDescricao: imovelDesc,
    valorAluguel,
    dataInicio,
    dataFim,
    diaPagamento: diaPgto,
    garantia,
    reajuste,
    fileName,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const autoCreate = formData.get("autoCreate") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const results: {
      fileName: string;
      status: "success" | "error" | "parsed";
      data?: ParsedContract;
      contractId?: string;
      error?: string;
    }[] = [];

    for (const file of files) {
      // Skip non-contract files (vistorias, procuracoes, etc)
      const nameLower = file.name.toLowerCase();
      if (!nameLower.includes("contrat") && !nameLower.includes("locaç")) {
        results.push({ fileName: file.name, status: "error", error: "Arquivo ignorado (não é contrato)" });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdf = await pdfParse(buffer);
        const parsed = extractContractData(pdf.text, file.name);

        if (!autoCreate) {
          // Just return parsed data for preview
          results.push({ fileName: file.name, status: "parsed", data: parsed });
          continue;
        }

        // Auto-create: validate and create contract
        if (!parsed.locatarioCpf) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: "CPF do locatário não encontrado no PDF" });
          continue;
        }
        if (!parsed.valorAluguel) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: "Valor do aluguel não encontrado" });
          continue;
        }
        if (!parsed.dataInicio || !parsed.dataFim) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: "Datas do contrato não encontradas" });
          continue;
        }

        // Find tenant by CPF
        const tenantCpfClean = cleanCpfCnpj(parsed.locatarioCpf);
        const allTenants = await prisma.tenant.findMany({ where: { active: true } });
        const tenant = allTenants.find(t => cleanCpfCnpj(t.cpfCnpj) === tenantCpfClean);
        if (!tenant) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: `Locatário não encontrado: ${parsed.locatarioCpf} (${parsed.locatarioNome})` });
          continue;
        }

        // Find owner by CPF/CNPJ
        let owner = null;
        if (parsed.proprietarioCpfCnpj) {
          const ownerDocClean = cleanCpfCnpj(parsed.proprietarioCpfCnpj);
          const allOwners = await prisma.owner.findMany({ where: { active: true } });
          owner = allOwners.find(o => cleanCpfCnpj(o.cpfCnpj) === ownerDocClean);
        }
        if (!owner) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: `Proprietário não encontrado: ${parsed.proprietarioCpfCnpj || 'N/A'} (${parsed.proprietarioNome})` });
          continue;
        }

        // Find or create property by description match
        let property = null;
        if (parsed.imovelDescricao) {
          // Try to match property by address keywords
          const allProps = await prisma.property.findMany({ where: { ownerId: owner.id } });
          const descLower = parsed.imovelDescricao.toLowerCase();
          property = allProps.find(p => {
            const titleLower = (p.title || "").toLowerCase();
            const streetLower = (p.street || "").toLowerCase();
            // Match by street name or title keywords
            return descLower.includes(streetLower) || streetLower.includes(descLower.split(",")[0].toLowerCase().trim());
          });
        }

        // Generate contract code from filename
        const fileCode = file.name.match(/^(\d+)/);
        const code = fileCode ? `CTR-${fileCode[1]}` : `CTR-${Date.now()}`;

        // Check if contract already exists
        const existing = await prisma.contract.findUnique({ where: { code } });
        if (existing) {
          results.push({ fileName: file.name, status: "error", data: parsed, error: `Contrato ${code} já existe` });
          continue;
        }

        // Create contract
        const contract = await prisma.contract.create({
          data: {
            code,
            type: "LOCACAO",
            status: "ATIVO",
            propertyId: property?.id || null,
            ownerId: owner.id,
            tenantId: tenant.id,
            rentalValue: parsed.valorAluguel,
            adminFeePercent: 10,
            startDate: new Date(parsed.dataInicio),
            endDate: new Date(parsed.dataFim),
            paymentDay: parsed.diaPagamento || 5,
            guaranteeType: parsed.garantia,
            adjustmentIndex: parsed.reajuste || "IGPM",
            notes: `Importado do PDF: ${file.name}. Imóvel: ${parsed.imovelDescricao || 'N/A'}`,
          },
        });

        // Save PDF as document
        const uploadsDir = path.join(process.cwd(), "apps/web/public/uploads/contracts");
        try { await fs.mkdir(uploadsDir, { recursive: true }); } catch {}
        const pdfFileName = `${contract.id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const pdfPath = path.join(uploadsDir, pdfFileName);
        await fs.writeFile(pdfPath, buffer);

        // Update contract with document URL
        await prisma.contract.update({
          where: { id: contract.id },
          data: { documentUrl: `/uploads/contracts/${pdfFileName}` },
        });

        results.push({
          fileName: file.name,
          status: "success",
          data: parsed,
          contractId: contract.id,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          status: "error",
          error: `Erro ao processar: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
        });
      }
    }

    const success = results.filter(r => r.status === "success").length;
    const errors = results.filter(r => r.status === "error").length;
    const parsed = results.filter(r => r.status === "parsed").length;

    return NextResponse.json({ results, summary: { total: files.length, success, errors, parsed } });
  } catch (error) {
    console.error("Contract import error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
