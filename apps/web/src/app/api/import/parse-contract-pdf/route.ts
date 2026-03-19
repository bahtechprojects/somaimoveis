import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { extractTextFromPDF } from "@/lib/pdf-ocr";

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

type DocType = "LOCACAO" | "ADMINISTRACAO" | "VISTORIA" | "PROCURACAO" | "ADITIVO" | "INTERMEDIACAO" | "OUTRO";

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

// Classify document type by filename and content
function classifyDocument(fileName: string, text: string): DocType {
  const nameLower = fileName.toLowerCase();
  const textLower = text.toLowerCase().substring(0, 2000);

  if (nameLower.includes("vistori")) return "VISTORIA";
  if (nameLower.includes("procura")) return "PROCURACAO";
  if (nameLower.includes("aditivo")) return "ADITIVO";
  if (nameLower.includes("intermedia")) return "INTERMEDIACAO";
  if (nameLower.includes("administra") || nameLower.includes("adm")) return "ADMINISTRACAO";
  if (nameLower.includes("locaç") || nameLower.includes("locac") || nameLower.includes("aluguel")) return "LOCACAO";
  if (nameLower.includes("contrat") || nameLower.includes("comtrat")) {
    // Check content to decide type
    if (textLower.includes("intermediação") || textLower.includes("intermediacao") || textLower.includes("administração de locação")) return "ADMINISTRACAO";
    if (textLower.includes("locação") || textLower.includes("locacao") || textLower.includes("locatário")) return "LOCACAO";
    return "LOCACAO"; // default for generic "contrato"
  }
  // Check content as last resort
  if (textLower.includes("vistoria")) return "VISTORIA";
  if (textLower.includes("procuração") || textLower.includes("procuracao")) return "PROCURACAO";
  if (textLower.includes("aditivo") || textLower.includes("cessão de direitos")) return "ADITIVO";
  return "OUTRO";
}

const SOMMA_CNPJ = "40528068000162";

interface ParsedDocument {
  tipo: DocType;
  proprietarioNome: string | null;
  proprietarioCpfCnpj: string | null;
  locatarioNome: string | null;
  locatarioCpf: string | null;
  imovelDescricao: string | null;
  valorAluguel: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  diaPagamento: number | null;
  garantia: string | null;
  reajuste: string | null;
  fileName: string;
  notes: string | null;
}

function extractOwnerInfo(t: string): { nome: string | null; doc: string | null } {
  let nome: string | null = null;
  let doc: string | null = null;

  // Find proprietario section
  const propMatch = t.match(
    /PROPRIET[ÁA]RIO[S]?(?:\(A\))?(?:\(S\))?[:\s]+(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|com sede|portador|solteiro|casad|viúv|divorc|natural|CPF|CNPJ))/i
  );
  if (propMatch) nome = propMatch[1].trim();

  // Also try OUTORGANTE for procuracoes
  if (!nome) {
    const outMatch = t.match(
      /OUTORGANTE[S]?[:\s]+(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|com sede|portador|solteiro|casad))/i
    );
    if (outMatch) nome = outMatch[1].trim();
  }

  // Also try LOCADOR for some contract formats
  if (!nome) {
    const locadorMatch = t.match(
      /LOCADOR[A]?[:\s]+(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|com sede|portador|solteiro|casad|representad))/i
    );
    if (locadorMatch) nome = locadorMatch[1].trim();
  }

  // Find CNPJ (skip Somma's)
  const propStart = t.search(/(?:PROPRIET[ÁA]RIO|OUTORGANTE|LOCADOR)/i);
  const nextSection = t.search(/(?:LOCAT[ÁA]RIO|OUTORGAD[AO]|ADMINISTRAD)/i);
  if (propStart >= 0) {
    const end = nextSection > propStart ? nextSection : propStart + 1500;
    const section = t.substring(propStart, end);
    const cnpjs = [...section.matchAll(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g)];
    for (const c of cnpjs) {
      if (cleanCpfCnpj(c[1]) !== SOMMA_CNPJ) {
        doc = c[1];
        break;
      }
    }
    if (!doc) {
      const cpfMatch = section.match(/(?:CPF)[/MF]*\s*(?:n[°ºo]\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
      if (cpfMatch && cleanCpfCnpj(cpfMatch[1]) !== SOMMA_CNPJ) {
        doc = cpfMatch[1];
      }
    }
  }

  return { nome, doc };
}

function extractTenantInfo(t: string): { nome: string | null; cpf: string | null } {
  let nome: string | null = null;
  let cpf: string | null = null;

  const locMatch = t.match(
    /LOCAT[ÁA]RIO[S]?(?:\(A\))?[:\s]+(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|portador|solteiro|casad|viúv|divorc|natural|menor|maior|CPF|CNPJ))/i
  );
  if (locMatch) nome = locMatch[1].trim();

  // CPF in locatario section
  const locStart = t.search(/LOCAT[ÁA]RIO/i);
  const nextSection = t.search(/(?:FIADOR|IM[ÓO]VEL\s+OBJETO|CL[ÁA]USULA)/i);
  if (locStart >= 0) {
    const end = nextSection > locStart ? nextSection : locStart + 1500;
    const section = t.substring(locStart, end);
    const cpfMatch = section.match(/(?:CPF)[/MF]*\s*(?:n[°ºo]\s*|sob\s*n[°ºo]\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
    if (cpfMatch) cpf = cpfMatch[1];
  }

  return { nome, cpf };
}

function extractLocacaoData(text: string, fileName: string): ParsedDocument {
  const t = text.replace(/\s+/g, " ");
  const owner = extractOwnerInfo(t);
  const tenant = extractTenantInfo(t);

  // Imovel
  let imovelDesc: string | null = null;
  const imMatch = t.match(
    /IM[ÓO]VEL\s+OBJETO\s+DA\s+LOCA[ÇC][ÃA]O[:\s]+(.+?)(?:FINALIDADE|CL[ÁA]USULA|\.(?:\s|$))/i
  );
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  // Prazo
  let dataInicio: string | null = null;
  let dataFim: string | null = null;
  const prazoMatch = t.match(
    /in[íi]cio\s+em\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})[\s\S]*?t[eé]rmin?o\s+em\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i
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
    /(?:VALOR\s+(?:DO\s+)?ALUGUEL|valor\s+mensal\s+do\s+aluguel|VALOR\s+ESTIPULADO)[\s\S]*?R\$\s*([\d.,]+)/i
  );
  if (valorMatch) valorAluguel = parseValor(valorMatch[1]);

  // Dia pagamento
  let diaPgto: number | null = null;
  const diaMatch = t.match(/(?:NO\s+)?DIA\s+(\d{1,2})\s*\(/i);
  if (diaMatch) diaPgto = parseInt(diaMatch[1]);

  // Garantia
  let garantia: string | null = null;
  if (/FIADOR[A]?:/i.test(t)) garantia = "FIADOR";
  else if (/seguro[\s-]*fian[çc]a/i.test(t)) garantia = "SEGURO_FIANCA";
  else if (/cau[çc][ãa]o/i.test(t)) garantia = "CAUCAO";
  else if (/carta[\s-]*fian[çc]a/i.test(t)) garantia = "SEGURO_FIANCA";
  else if (/t[ií]tulo[\s\S]{0,10}capitaliza/i.test(t)) garantia = "TITULO_CAPITALIZACAO";

  // Reajuste
  let reajuste: string | null = null;
  if (/IGPM|IGP-M/i.test(t)) reajuste = "IGPM";
  else if (/IPCA|IPC-A/i.test(t)) reajuste = "IPCA";
  else if (/INPC/i.test(t)) reajuste = "INPC";

  return {
    tipo: "LOCACAO",
    proprietarioNome: owner.nome,
    proprietarioCpfCnpj: owner.doc,
    locatarioNome: tenant.nome,
    locatarioCpf: tenant.cpf,
    imovelDescricao: imovelDesc,
    valorAluguel,
    dataInicio,
    dataFim,
    diaPagamento: diaPgto,
    garantia,
    reajuste,
    fileName,
    notes: null,
  };
}

function extractAdministracaoData(text: string, fileName: string): ParsedDocument {
  const t = text.replace(/\s+/g, " ");
  const owner = extractOwnerInfo(t);

  // Property description
  let imovelDesc: string | null = null;
  const imMatch = t.match(/(?:Endere[çc]o|ENDERE[ÇC]O|IM[ÓO]VEL)[:\s]+(.+?)(?:CEP|Finalidade|CL[ÁA]USULA)/i);
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  // Valor estipulado
  let valor: number | null = null;
  const valorMatch = t.match(/VALOR\s+ESTIPULADO[\s\S]*?R\$\s*([\d.,]+)/i);
  if (valorMatch) valor = parseValor(valorMatch[1]);

  return {
    tipo: "ADMINISTRACAO",
    proprietarioNome: owner.nome,
    proprietarioCpfCnpj: owner.doc,
    locatarioNome: null,
    locatarioCpf: null,
    imovelDescricao: imovelDesc,
    valorAluguel: valor,
    dataInicio: null,
    dataFim: null,
    diaPagamento: null,
    garantia: null,
    reajuste: null,
    fileName,
    notes: "Contrato de administração",
  };
}

function extractVistoriaData(text: string, fileName: string): ParsedDocument {
  const t = text.replace(/\s+/g, " ");

  // Locador
  let propNome: string | null = null;
  const locadorMatch = t.match(/Locador[\(a\)]*[:\s]+(.+?)(?:\n|Locat|Tipo|$)/i);
  if (locadorMatch) propNome = locadorMatch[1].trim().substring(0, 100);

  // Locatario
  let locNome: string | null = null;
  const locMatch = t.match(/Locat[áa]rio[\(a\)]*[:\s]+(.+?)(?:\n|Tipo|Im[óo]vel|$)/i);
  if (locMatch) locNome = locMatch[1].trim().substring(0, 100);

  // Imovel
  let imovelDesc: string | null = null;
  const imMatch = t.match(/(?:Im[óo]vel|ENDERE[ÇC]O)[:\s]+(.+?)(?:\n|Metragem|CEP|$)/i);
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  // Tipo vistoria (Entrada/Saida)
  let tipoVistoria: string | null = null;
  const tipoMatch = t.match(/Tipo\s+de\s+vistoria[:\s]+(Entrada|Sa[ií]da)/i);
  if (tipoMatch) tipoVistoria = tipoMatch[1];

  return {
    tipo: "VISTORIA",
    proprietarioNome: propNome,
    proprietarioCpfCnpj: null,
    locatarioNome: locNome,
    locatarioCpf: null,
    imovelDescricao: imovelDesc,
    valorAluguel: null,
    dataInicio: null,
    dataFim: null,
    diaPagamento: null,
    garantia: null,
    reajuste: null,
    fileName,
    notes: tipoVistoria ? `Vistoria de ${tipoVistoria}` : "Vistoria",
  };
}

function extractProcuracaoData(text: string, fileName: string): ParsedDocument {
  const t = text.replace(/\s+/g, " ");
  const owner = extractOwnerInfo(t);

  // Property from procuracao
  let imovelDesc: string | null = null;
  const imMatch = t.match(/(?:im[óo]vel|propriedade)[\s\S]*?(?:sito|situad|localiz)[ao]?\s+(?:na|no|em)\s+(.+?)(?:\.|,\s*(?:para|com|conferindo))/i);
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  return {
    tipo: "PROCURACAO",
    proprietarioNome: owner.nome,
    proprietarioCpfCnpj: owner.doc,
    locatarioNome: null,
    locatarioCpf: null,
    imovelDescricao: imovelDesc,
    valorAluguel: null,
    dataInicio: null,
    dataFim: null,
    diaPagamento: null,
    garantia: null,
    reajuste: null,
    fileName,
    notes: "Procuração",
  };
}

function extractAditivoData(text: string, fileName: string): ParsedDocument {
  const t = text.replace(/\s+/g, " ");
  const owner = extractOwnerInfo(t);
  const tenant = extractTenantInfo(t);

  // Try to find new tenant (cessionario)
  let newTenantNome: string | null = null;
  const cessMatch = t.match(
    /CESSION[ÁA]RI[AO][:\s]+(.+?)(?:,\s*(?:brasileir|pessoa|empresa|inscrit|portador|solteiro|casad))/i
  );
  if (cessMatch) newTenantNome = cessMatch[1].trim();

  // Imovel
  let imovelDesc: string | null = null;
  const imMatch = t.match(/(?:im[óo]vel|propriedade)[\s\S]*?(?:sito|situad|localiz)[ao]?\s+(?:na|no|em)\s+(.+?)(?:\.|,\s*(?:para|com|nesta))/i);
  if (imMatch) imovelDesc = imMatch[1].trim().substring(0, 200);

  return {
    tipo: "ADITIVO",
    proprietarioNome: owner.nome,
    proprietarioCpfCnpj: owner.doc,
    locatarioNome: newTenantNome || tenant.nome,
    locatarioCpf: tenant.cpf,
    imovelDescricao: imovelDesc,
    valorAluguel: null,
    dataInicio: null,
    dataFim: null,
    diaPagamento: null,
    garantia: null,
    reajuste: null,
    fileName,
    notes: "Aditivo contratual",
  };
}

function extractDocumentData(text: string, fileName: string, tipo: DocType): ParsedDocument {
  switch (tipo) {
    case "LOCACAO": return extractLocacaoData(text, fileName);
    case "ADMINISTRACAO":
    case "INTERMEDIACAO": return extractAdministracaoData(text, fileName);
    case "VISTORIA": return extractVistoriaData(text, fileName);
    case "PROCURACAO": return extractProcuracaoData(text, fileName);
    case "ADITIVO": return extractAditivoData(text, fileName);
    default: return {
      tipo, proprietarioNome: null, proprietarioCpfCnpj: null,
      locatarioNome: null, locatarioCpf: null, imovelDescricao: null,
      valorAluguel: null, dataInicio: null, dataFim: null,
      diaPagamento: null, garantia: null, reajuste: null,
      fileName, notes: "Documento não classificado",
    };
  }
}

// Allow up to 5 minutes for OCR processing
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const autoCreate = formData.get("autoCreate") === "true";
    const filterType = formData.get("filterType") as string | null; // optional type filter

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const results: {
      fileName: string;
      status: "success" | "error" | "parsed" | "skipped";
      tipo?: DocType;
      data?: ParsedDocument;
      contractId?: string;
      error?: string;
    }[] = [];

    for (const file of files) {
      // Skip non-PDF files
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        results.push({ fileName: file.name, status: "skipped", error: "Não é PDF" });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        let pdfText = "";
        try {
          pdfText = await extractTextFromPDF(buffer);
        } catch (pdfErr) {
          results.push({ fileName: file.name, status: "error", error: `Erro ao ler PDF: ${pdfErr instanceof Error ? pdfErr.message : "desconhecido"}` });
          continue;
        }

        const tipo = classifyDocument(file.name, pdfText);

        // If filter is set, skip non-matching types
        if (filterType && tipo !== filterType) {
          results.push({ fileName: file.name, status: "skipped", tipo, error: `Tipo ${tipo} filtrado` });
          continue;
        }

        const parsed = extractDocumentData(pdfText, file.name, tipo);

        if (!autoCreate) {
          results.push({ fileName: file.name, status: "parsed", tipo, data: parsed });
          continue;
        }

        // Auto-create: find or create owner
        let owner = null;
        if (parsed.proprietarioCpfCnpj) {
          const ownerDocClean = cleanCpfCnpj(parsed.proprietarioCpfCnpj);
          const allOwners = await prisma.owner.findMany({ where: { active: true } });
          owner = allOwners.find(o => cleanCpfCnpj(o.cpfCnpj) === ownerDocClean);

          // Auto-create owner if not found
          if (!owner && parsed.proprietarioNome) {
            const isPJ = ownerDocClean.length > 11;
            owner = await prisma.owner.create({
              data: {
                name: parsed.proprietarioNome,
                cpfCnpj: parsed.proprietarioCpfCnpj,
                personType: isPJ ? "PJ" : "PF",
              },
            });
          }
        }
        if (!owner) {
          results.push({ fileName: file.name, status: "error", tipo, data: parsed, error: `Proprietário não encontrado e dados insuficientes para criar: ${parsed.proprietarioCpfCnpj || "N/A"}` });
          continue;
        }

        // Find or create tenant
        let tenantId: string | null = null;
        if (parsed.locatarioCpf) {
          const tenantCpfClean = cleanCpfCnpj(parsed.locatarioCpf);
          const allTenants = await prisma.tenant.findMany({ where: { active: true } });
          const tenant = allTenants.find(t => cleanCpfCnpj(t.cpfCnpj) === tenantCpfClean);
          if (tenant) {
            tenantId = tenant.id;
          } else if (parsed.locatarioNome) {
            // Auto-create tenant
            const isPJ = tenantCpfClean.length > 11;
            const newTenant = await prisma.tenant.create({
              data: {
                name: parsed.locatarioNome,
                cpfCnpj: parsed.locatarioCpf,
                personType: isPJ ? "PJ" : "PF",
              },
            });
            tenantId = newTenant.id;
          }
        }
        if (!tenantId && tipo === "LOCACAO") {
          results.push({ fileName: file.name, status: "error", tipo, data: parsed, error: `Locatário não encontrado e dados insuficientes: ${parsed.locatarioCpf || "N/A"}` });
          continue;
        }

        // Find or create property
        let propertyId: string | null = null;
        if (parsed.imovelDescricao) {
          const descLower = parsed.imovelDescricao.toLowerCase();
          const allProps = await prisma.property.findMany();
          const prop = allProps.find(p => {
            const street = (p.street || "").toLowerCase();
            return street.length > 3 && descLower.includes(street);
          });
          if (prop) {
            propertyId = prop.id;
          } else if (owner) {
            // Auto-create property from contract description
            const descParts = parsed.imovelDescricao.split(",").map(s => s.trim());
            const newProp = await prisma.property.create({
              data: {
                title: descParts[0]?.substring(0, 100) || "Imóvel importado",
                type: parsed.imovelDescricao.toLowerCase().includes("apartamento") ? "APARTAMENTO"
                  : parsed.imovelDescricao.toLowerCase().includes("sala") ? "SALA"
                  : parsed.imovelDescricao.toLowerCase().includes("comercial") ? "COMERCIAL"
                  : "CASA",
                status: "ALUGADO",
                street: descParts[0] || "A definir",
                number: descParts.find(p => /^\d+$/.test(p)) || "S/N",
                neighborhood: descParts.length > 2 ? descParts[descParts.length - 2] : "A definir",
                city: descParts.length > 1 ? descParts[descParts.length - 1] : "A definir",
                state: "RS",
                zipCode: "",
                ownerId: owner.id,
                rentalValue: parsed.valorAluguel || 0,
              },
            });
            propertyId = newProp.id;
          }
        }

        // Generate code
        const fileCode = file.name.match(/^(\d+)/);
        const prefix = tipo === "LOCACAO" ? "CTR" : tipo === "ADMINISTRACAO" ? "ADM" : tipo === "VISTORIA" ? "VIS" : tipo === "PROCURACAO" ? "PRO" : tipo === "ADITIVO" ? "ADT" : "DOC";
        const code = fileCode ? `${prefix}-${fileCode[1]}` : `${prefix}-${Date.now()}`;

        // Check duplicate
        const existing = await prisma.contract.findUnique({ where: { code } });
        if (existing) {
          results.push({ fileName: file.name, status: "error", tipo, data: parsed, error: `Documento ${code} já existe` });
          continue;
        }

        // Determine status based on type
        let status = "ATIVO";
        if (tipo === "VISTORIA" || tipo === "PROCURACAO" || tipo === "ADITIVO") {
          status = "ATIVO"; // document attached to owner
        }

        // Create contract/document record
        const contract = await prisma.contract.create({
          data: {
            code,
            type: tipo,
            status,
            propertyId: propertyId || undefined,
            ownerId: owner.id,
            tenantId: tenantId || undefined,
            rentalValue: parsed.valorAluguel || 0,
            adminFeePercent: 10,
            startDate: parsed.dataInicio ? new Date(parsed.dataInicio) : new Date(),
            endDate: parsed.dataFim ? new Date(parsed.dataFim) : new Date(),
            paymentDay: parsed.diaPagamento || 5,
            guaranteeType: parsed.garantia,
            adjustmentIndex: parsed.reajuste || (tipo === "LOCACAO" ? "IGPM" : null),
            notes: parsed.notes ? `${parsed.notes} - Importado: ${file.name}` : `Importado: ${file.name}`,
          },
        });

        results.push({
          fileName: file.name,
          status: "success",
          tipo,
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
    const skipped = results.filter(r => r.status === "skipped").length;

    // Count by type
    const byType: Record<string, number> = {};
    for (const r of results) {
      if (r.tipo) byType[r.tipo] = (byType[r.tipo] || 0) + 1;
    }

    return NextResponse.json({ results, summary: { total: files.length, success, errors, parsed, skipped, byType } });
  } catch (error) {
    console.error("Contract import error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
