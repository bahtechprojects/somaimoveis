import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

type EntityType = "owners" | "tenants" | "properties" | "contracts";

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

// Column name mapping (Portuguese + variações de outros sistemas → Prisma field)
// Compatível com: Imobzi, Superlógica, VivaReal, Imoview, Jetimob, InGaia, Universal Software, etc.
const COLUMN_MAPS: Record<EntityType, Record<string, string>> = {
  owners: {
    // Nome
    nome: "name", name: "name", nome_completo: "name", nome_proprietario: "name",
    razao_social: "name", razao: "name", proprietario: "name", responsavel: "name",
    nome_razao_social: "name", nome_fantasia: "name", locador: "name",
    // Email
    email: "email", e_mail: "email", email_proprietario: "email", email_principal: "email",
    email_contato: "email", correio_eletronico: "email",
    // Telefone
    telefone: "phone", phone: "phone", celular: "phone", tel: "phone",
    telefone_principal: "phone", telefone_celular: "phone", tel_celular: "phone",
    fone: "phone", contato: "phone", whatsapp: "phone", telefone_proprietario: "phone",
    principal: "phone", comercial: "phone",
    fone_residencial: "phone", fone_comercial: "phone",
    telefone_residencial: "phone", telefone_comercial: "phone",
    // CPF/CNPJ
    cpf_cnpj: "cpfCnpj", cpf: "cpfCnpj", cnpj: "cpfCnpj", cpfcnpj: "cpfCnpj",
    documento: "cpfCnpj", doc: "cpfCnpj", cpf_cnpj_proprietario: "cpfCnpj",
    inscricao: "cpfCnpj", numero_documento: "cpfCnpj", nr_documento: "cpfCnpj",
    // Tipo Pessoa
    tipo_pessoa: "personType", tipo: "personType", pessoa: "personType",
    tipo_cadastro: "personType", natureza: "personType", pf_pj: "personType",
    // Dia Pagamento (locadores) - stored in notes
    dia_pgto: "_paymentDay", dia_pagamento: "_paymentDay",
    // Endereço
    rua: "street", street: "street", logradouro: "street", endereco: "street",
    endereco_rua: "street", via: "street", avenida: "street", alameda: "street",
    numero: "number", number: "number", num: "number", nro: "number", nr: "number",
    endereco_numero: "number", numero_endereco: "number",
    complemento: "complement", complement: "complement", compl: "complement",
    apto: "complement", apartamento: "complement", sala: "complement", bloco: "complement",
    bairro: "neighborhood", neighborhood: "neighborhood", setor: "neighborhood",
    regiao: "neighborhood", distrito: "neighborhood",
    cidade: "city", city: "city", municipio: "city", localidade: "city",
    estado: "state", state: "state", uf: "state", sigla_estado: "state",
    cep: "zipCode", zipcode: "zipCode", zip_code: "zipCode", codigo_postal: "zipCode",
    // Dados Bancários
    banco: "bankName", bank_name: "bankName", nome_banco: "bankName",
    instituicao_bancaria: "bankName", banco_nome: "bankName",
    agencia: "bankAgency", bank_agency: "bankAgency", ag: "bankAgency",
    numero_agencia: "bankAgency", agencia_banco: "bankAgency",
    conta: "bankAccount", bank_account: "bankAccount", conta_corrente: "bankAccount",
    numero_conta: "bankAccount", cc: "bankAccount", conta_banco: "bankAccount",
    pix: "bankPix", bank_pix: "bankPix", chave_pix: "bankPix", pix_key: "bankPix",
    // Observações
    observacoes: "notes", notes: "notes", obs: "notes", observacao: "notes",
    anotacoes: "notes", comentarios: "notes", notas: "notes",
  },
  tenants: {
    // Nome
    nome: "name", name: "name", nome_completo: "name", nome_locatario: "name",
    nome_inquilino: "name", razao_social: "name", razao: "name", locatario: "name",
    inquilino: "name", nome_razao_social: "name", nome_fantasia: "name",
    responsavel: "name",
    // Email
    email: "email", e_mail: "email", email_locatario: "email", email_inquilino: "email",
    email_principal: "email", email_contato: "email", correio_eletronico: "email",
    // Telefone
    telefone: "phone", phone: "phone", celular: "phone", tel: "phone",
    telefone_principal: "phone", telefone_celular: "phone", tel_celular: "phone",
    fone: "phone", contato: "phone", whatsapp: "phone", telefone_locatario: "phone",
    principal: "phone", comercial: "phone",
    fone_residencial: "phone", fone_comercial: "phone",
    telefone_residencial: "phone", telefone_comercial: "phone",
    // CPF/CNPJ
    cpf_cnpj: "cpfCnpj", cpf: "cpfCnpj", cnpj: "cpfCnpj", cpfcnpj: "cpfCnpj",
    documento: "cpfCnpj", doc: "cpfCnpj", cpf_cnpj_locatario: "cpfCnpj",
    inscricao: "cpfCnpj", numero_documento: "cpfCnpj", nr_documento: "cpfCnpj",
    // Tipo Pessoa
    tipo_pessoa: "personType", tipo: "personType", pessoa: "personType",
    tipo_cadastro: "personType", natureza: "personType", pf_pj: "personType",
    // Endereço (anterior)
    rua: "street", street: "street", logradouro: "street", endereco: "street",
    endereco_anterior: "street", endereco_rua: "street",
    numero: "number", number: "number", num: "number", nro: "number", nr: "number",
    complemento: "complement", complement: "complement", compl: "complement",
    apto: "complement", apartamento: "complement",
    bairro: "neighborhood", neighborhood: "neighborhood", setor: "neighborhood",
    cidade: "city", city: "city", municipio: "city", localidade: "city",
    estado: "state", state: "state", uf: "state", sigla_estado: "state",
    cep: "zipCode", zipcode: "zipCode", zip_code: "zipCode", codigo_postal: "zipCode",
    // RG
    rg: "rgNumber", rg_number: "rgNumber", identidade: "rgNumber",
    numero_rg: "rgNumber", registro_geral: "rgNumber", nr_identidade: "rgNumber",
    // Profissional
    profissao: "occupation", occupation: "occupation", cargo: "occupation",
    atividade: "occupation", funcao: "occupation", ocupacao: "occupation",
    atividade_profissional: "occupation", profissao_ocupacao: "occupation",
    renda_mensal: "monthlyIncome", renda: "monthlyIncome", monthly_income: "monthlyIncome",
    salario: "monthlyIncome", rendimento: "monthlyIncome", renda_bruta: "monthlyIncome",
    renda_comprovada: "monthlyIncome", valor_renda: "monthlyIncome",
    receita_mensal: "monthlyIncome",
    // Observações
    observacoes: "notes", notes: "notes", obs: "notes", observacao: "notes",
    anotacoes: "notes", comentarios: "notes", notas: "notes",
  },
  properties: {
    // Título / Identificação
    titulo: "title", title: "title", nome: "title", nome_imovel: "title",
    identificacao: "title", referencia: "title", ref: "title", codigo_imovel: "title",
    descricao_imovel: "title", denominacao: "title",
    // Descrição
    descricao: "description", description: "description", detalhes: "description",
    obs_imovel: "description", caracteristicas: "description",
    // Tipo
    tipo: "type", type: "type", tipo_imovel: "type", categoria: "type",
    finalidade: "type", classe: "type", subtipo: "type",
    // Status
    status: "status", situacao: "status", estado_imovel: "status",
    disponibilidade: "status", status_imovel: "status",
    // Endereço
    rua: "street", street: "street", logradouro: "street", endereco: "street",
    endereco_imovel: "street", via: "street", avenida: "street",
    numero: "number", number: "number", num: "number", nro: "number", nr: "number",
    numero_endereco: "number",
    complemento: "complement", complement: "complement", compl: "complement",
    apto: "complement", apartamento: "complement", sala: "complement",
    bloco: "complement", unidade: "complement", andar: "complement",
    bairro: "neighborhood", neighborhood: "neighborhood", setor: "neighborhood",
    regiao: "neighborhood", distrito: "neighborhood",
    cidade: "city", city: "city", municipio: "city", localidade: "city",
    estado: "state", state: "state", uf: "state", sigla_estado: "state",
    cep: "zipCode", zipcode: "zipCode", zip_code: "zipCode", codigo_postal: "zipCode",
    // Detalhes do imóvel
    area: "area", area_util: "area", area_total: "area", metragem: "area",
    area_construida: "area", area_privativa: "area", m2: "area", metros_quadrados: "area",
    quartos: "bedrooms", bedrooms: "bedrooms", dormitorios: "bedrooms",
    suites: "bedrooms", num_quartos: "bedrooms", qtd_quartos: "bedrooms",
    numero_quartos: "bedrooms", dormitorio: "bedrooms",
    banheiros: "bathrooms", bathrooms: "bathrooms", wc: "bathrooms",
    num_banheiros: "bathrooms", qtd_banheiros: "bathrooms", lavabos: "bathrooms",
    vagas: "parkingSpaces", parking_spaces: "parkingSpaces", garagem: "parkingSpaces",
    vagas_garagem: "parkingSpaces", num_vagas: "parkingSpaces", qtd_vagas: "parkingSpaces",
    estacionamento: "parkingSpaces",
    mobiliado: "furnished", furnished: "furnished", mobilia: "furnished",
    com_mobilia: "furnished",
    // Valores
    valor_aluguel: "rentalValue", aluguel: "rentalValue", rental_value: "rentalValue",
    valor_locacao: "rentalValue", preco_aluguel: "rentalValue", valor_mensal: "rentalValue",
    aluguel_mensal: "rentalValue", valor_aluguel_mensal: "rentalValue",
    valor_venda: "saleValue", sale_value: "saleValue", preco_venda: "saleValue",
    preco: "saleValue", valor_imovel: "saleValue",
    condominio: "condoFee", condo_fee: "condoFee", taxa_condominio: "condoFee",
    valor_condominio: "condoFee", cond: "condoFee",
    iptu: "iptuValue", iptu_value: "iptuValue", valor_iptu: "iptuValue",
    iptu_mensal: "iptuValue", iptu_anual: "iptuValue",
    // Proprietário (referência)
    proprietario_email: "_ownerEmail", owner_email: "_ownerEmail",
    email_proprietario: "_ownerEmail", email_dono: "_ownerEmail",
    proprietario_cpf: "_ownerCpf", owner_cpf: "_ownerCpf",
    cpf_proprietario: "_ownerCpf", cpf_cnpj_proprietario: "_ownerCpf",
    documento_proprietario: "_ownerCpf",
    // Observações
    observacoes: "notes", notes: "notes", obs: "notes", observacao: "notes",
    anotacoes: "notes", comentarios: "notes", notas: "notes",
  },
  contracts: {
    // Código
    codigo: "code", code: "code", numero_contrato: "code", num_contrato: "code",
    contrato: "code", referencia: "code", ref: "code", nr_contrato: "code",
    id_contrato: "code", codigo_contrato: "code",
    // Tipo
    tipo: "type", type: "type", tipo_contrato: "type", modalidade: "type",
    natureza: "type", finalidade: "type",
    // Status
    status: "status", situacao: "status", estado: "status",
    status_contrato: "status", situacao_contrato: "status",
    // Imóvel (referência)
    imovel_titulo: "_propertyTitle", property_title: "_propertyTitle",
    imovel: "_propertyTitle", nome_imovel: "_propertyTitle",
    endereco_imovel: "_propertyTitle", referencia_imovel: "_propertyTitle",
    codigo_imovel: "_propertyTitle", identificacao_imovel: "_propertyTitle",
    // Locatário (referência)
    locatario_email: "_tenantEmail", tenant_email: "_tenantEmail",
    email_locatario: "_tenantEmail", email_inquilino: "_tenantEmail",
    locatario_cpf: "_tenantCpf", tenant_cpf: "_tenantCpf",
    cpf_locatario: "_tenantCpf", cpf_cnpj_locatario: "_tenantCpf",
    cpf_inquilino: "_tenantCpf", documento_locatario: "_tenantCpf",
    // Proprietário (referência)
    proprietario_email: "_ownerEmail", owner_email: "_ownerEmail",
    email_proprietario: "_ownerEmail",
    proprietario_cpf: "_ownerCpf", owner_cpf: "_ownerCpf",
    cpf_proprietario: "_ownerCpf", cpf_cnpj_proprietario: "_ownerCpf",
    documento_proprietario: "_ownerCpf",
    // Valores
    valor_aluguel: "rentalValue", aluguel: "rentalValue", rental_value: "rentalValue",
    valor_locacao: "rentalValue", valor_mensal: "rentalValue",
    preco_aluguel: "rentalValue", aluguel_mensal: "rentalValue",
    taxa_admin: "adminFeePercent", admin_fee: "adminFeePercent",
    taxa_administracao: "adminFeePercent", comissao: "adminFeePercent",
    percentual_administracao: "adminFeePercent", taxa_adm: "adminFeePercent",
    // Datas
    data_inicio: "startDate", start_date: "startDate", inicio: "startDate",
    data_inicial: "startDate", vigencia_inicio: "startDate",
    inicio_contrato: "startDate", dt_inicio: "startDate", inicio_vigencia: "startDate",
    data_fim: "endDate", end_date: "endDate", fim: "endDate",
    data_final: "endDate", vigencia_fim: "endDate", termino: "endDate",
    fim_contrato: "endDate", dt_fim: "endDate", vencimento_contrato: "endDate",
    data_termino: "endDate", fim_vigencia: "endDate",
    dia_pagamento: "paymentDay", payment_day: "paymentDay",
    dia_vencimento: "paymentDay", vencimento: "paymentDay",
    dia_cobranca: "paymentDay", dia_repasse: "paymentDay",
    // Garantia
    tipo_garantia: "guaranteeType", guarantee_type: "guaranteeType",
    garantia: "guaranteeType", modalidade_garantia: "guaranteeType",
    forma_garantia: "guaranteeType",
    valor_garantia: "guaranteeValue", guarantee_value: "guaranteeValue",
    caucao: "guaranteeValue", valor_caucao: "guaranteeValue",
    valor_seguro_fianca: "guaranteeValue",
    // Reajuste
    indice_reajuste: "adjustmentIndex", adjustment_index: "adjustmentIndex",
    indice: "adjustmentIndex", reajuste: "adjustmentIndex",
    indice_correcao: "adjustmentIndex", tipo_reajuste: "adjustmentIndex",
    mes_reajuste: "adjustmentMonth", adjustment_month: "adjustmentMonth",
    mes_aniversario: "adjustmentMonth", data_reajuste: "adjustmentMonth",
    mes_correcao: "adjustmentMonth",
    // Observações
    observacoes: "notes", notes: "notes", obs: "notes", observacao: "notes",
    anotacoes: "notes", comentarios: "notes", notas: "notes",
    clausulas_especiais: "notes",
  },
};

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  owners: ["name", "cpfCnpj"],
  tenants: ["name", "cpfCnpj"],
  properties: ["title", "type", "street", "number", "neighborhood", "city", "state", "zipCode"],
  contracts: ["code", "rentalValue", "startDate", "endDate"],
};

function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[\s\-\/]+/g, "_") // spaces, hyphens, slashes → underscore
    .replace(/[^a-z0-9_]/g, "") // strip remaining punctuation (trailing dots, etc.)
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_|_$/g, ""); // trim leading/trailing underscores
}

function parseNumeric(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).replace(/[R$\s.]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseInt2(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = parseInt(String(value), 10);
  return isNaN(num) ? null : num;
}

function parseBoolean(value: string | boolean | undefined | null): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  const str = String(value).toLowerCase().trim();
  return ["sim", "s", "yes", "y", "true", "1", "verdadeiro"].includes(str);
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value || String(value).trim() === "") return null;
  const str = String(value).trim();

  // DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Try native parse
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function cleanCpfCnpj(value: string | undefined | null): string {
  if (!value) return "";
  return String(value).replace(/[.\-\/\s]/g, "").trim();
}

// Remove code prefixes from names (e.g., "26.581.862 EDILAMAR LUIZ" → "EDILAMAR LUIZ")
function cleanName(name: string): string {
  let clean = name.trim();
  // Remove leading numeric codes like "26.581.862" or "62.612.465"
  clean = clean.replace(/^\d[\d.]+\s+/, "");
  return clean;
}

// Take only the first email from comma-separated list
function cleanEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const str = String(email).trim();
  if (!str) return null;
  // Split by comma or semicolon and take first valid one
  const first = str.split(/[,;]/)[0].trim().toLowerCase();
  return first || null;
}

// Try to parse a full address field into street + number + complement
function parseFullAddress(address: string): { street: string; number: string | null; complement: string | null } {
  const str = address.trim();

  // Pattern: "Rua Xxx Yyy 123 Apto 456" or "Avenida Xxx 123 Sala 01"
  // Match the last number before optional complement keywords
  const complementKeywords = /\b(apto\.?|apartamento|sala|loja|bloco|bl\.?|casa|duplex|andar|edif\.?|ed\.?|pavlh?|conj\.?|box)\b/i;

  // Find complement part first
  const compMatch = str.match(complementKeywords);
  let mainPart = str;
  let complement: string | null = null;

  if (compMatch && compMatch.index !== undefined) {
    complement = str.substring(compMatch.index).trim();
    mainPart = str.substring(0, compMatch.index).trim();
  }

  // From the main part, extract the last number as the street number
  const numMatch = mainPart.match(/^(.+?)\s+(\d+)\s*$/);
  if (numMatch) {
    return {
      street: numMatch[1].trim(),
      number: numMatch[2],
      complement,
    };
  }

  return { street: mainPart, number: null, complement };
}

// Clean phone: normalize format
function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const str = String(phone).trim();
  if (!str) return null;
  // Take first phone if multiple separated by /
  const first = str.split("/")[0].trim();
  return first || null;
}

// Find owner/tenant by CPF checking both formatted and clean versions
async function findByCpfCnpj(model: "owner" | "tenant", cpfCnpj: string) {
  const clean = cleanCpfCnpj(cpfCnpj);
  // Try exact match first, then clean match
  if (model === "owner") {
    const exact = await prisma.owner.findUnique({ where: { cpfCnpj } });
    if (exact) return exact;
    const byClean = await prisma.owner.findUnique({ where: { cpfCnpj: clean } });
    if (byClean) return byClean;
    // Try all owners and compare cleaned
    const all = await prisma.owner.findMany({ where: { active: true } });
    return all.find(o => cleanCpfCnpj(o.cpfCnpj) === clean) || null;
  } else {
    const exact = await prisma.tenant.findUnique({ where: { cpfCnpj } });
    if (exact) return exact;
    const byClean = await prisma.tenant.findUnique({ where: { cpfCnpj: clean } });
    if (byClean) return byClean;
    const all = await prisma.tenant.findMany({ where: { active: true } });
    return all.find(t => cleanCpfCnpj(t.cpfCnpj) === clean) || null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>, columnMap: Record<string, string>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped: Record<string, any> = {};
  for (const [rawCol, value] of Object.entries(row)) {
    const normalized = normalizeColumnName(rawCol);
    const field = columnMap[normalized];
    if (field) {
      const strVal = String(value ?? "").trim();
      // Don't overwrite non-empty value with empty (handles CPF/CNPJ in separate columns)
      if (mapped[field] && (!strVal || strVal === "")) continue;
      mapped[field] = value;
    }
  }
  return mapped;
}

async function importOwners(rows: Record<string, unknown>[]): Promise<{ imported: number; errors: ImportError[] }> {
  const errors: ImportError[] = [];
  let imported = 0;
  const columnMap = COLUMN_MAPS.owners;
  const required = REQUIRED_FIELDS.owners;

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], columnMap);
    const rowNum = i + 2; // +2 because row 1 is header

    // Validate required
    for (const field of required) {
      if (!mapped[field] || String(mapped[field]).trim() === "") {
        errors.push({ row: rowNum, field, message: `Campo obrigatorio ausente: ${field}` });
      }
    }
    if (errors.some((e) => e.row === rowNum)) continue;

    const cpfCnpj = cleanCpfCnpj(mapped.cpfCnpj as string);

    try {
      // Check if already exists (handles both formatted and clean CPFs)
      const existing = await findByCpfCnpj("owner", cpfCnpj);
      if (existing) {
        errors.push({ row: rowNum, field: "cpfCnpj", message: `CPF/CNPJ ja cadastrado: ${cpfCnpj}` });
        continue;
      }

      // Parse address if street has full address and no separate number
      let street = mapped.street ? String(mapped.street).trim() : null;
      let number = mapped.number ? String(mapped.number).trim() : null;
      let complement = mapped.complement ? String(mapped.complement).trim() : null;
      if (street && !number) {
        const parsed = parseFullAddress(street);
        street = parsed.street;
        number = parsed.number;
        if (parsed.complement && !complement) complement = parsed.complement;
      }

      await prisma.owner.create({
        data: {
          name: cleanName(String(mapped.name)),
          email: cleanEmail(mapped.email as string),
          phone: cleanPhone(mapped.phone as string),
          cpfCnpj,
          personType: mapped.personType ? String(mapped.personType).toUpperCase().trim() : (cpfCnpj.length > 11 ? "PJ" : "PF"),
          street,
          number,
          complement,
          neighborhood: mapped.neighborhood ? String(mapped.neighborhood).trim() : null,
          city: mapped.city ? String(mapped.city).trim() : null,
          state: mapped.state ? String(mapped.state).toUpperCase().trim() : null,
          zipCode: mapped.zipCode ? String(mapped.zipCode).replace(/\D/g, "").trim() : null,
          bankName: mapped.bankName ? String(mapped.bankName).trim() : null,
          bankAgency: mapped.bankAgency ? String(mapped.bankAgency).trim() : null,
          bankAccount: mapped.bankAccount ? String(mapped.bankAccount).trim() : null,
          bankPix: mapped.bankPix ? String(mapped.bankPix).trim() : null,
          notes: [
            mapped.notes ? String(mapped.notes).trim() : null,
            mapped._paymentDay ? `Dia pgto: ${String(mapped._paymentDay).trim()}` : null,
          ].filter(Boolean).join(" | ") || null,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: `Erro ao salvar: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    }
  }

  return { imported, errors };
}

async function importTenants(rows: Record<string, unknown>[]): Promise<{ imported: number; errors: ImportError[] }> {
  const errors: ImportError[] = [];
  let imported = 0;
  const columnMap = COLUMN_MAPS.tenants;
  const required = REQUIRED_FIELDS.tenants;

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], columnMap);
    const rowNum = i + 2;

    for (const field of required) {
      if (!mapped[field] || String(mapped[field]).trim() === "") {
        errors.push({ row: rowNum, field, message: `Campo obrigatorio ausente: ${field}` });
      }
    }
    if (errors.some((e) => e.row === rowNum)) continue;

    const cpfCnpj = cleanCpfCnpj(mapped.cpfCnpj as string);

    try {
      const existing = await findByCpfCnpj("tenant", cpfCnpj);
      if (existing) {
        errors.push({ row: rowNum, field: "cpfCnpj", message: `CPF/CNPJ ja cadastrado: ${cpfCnpj}` });
        continue;
      }

      // Parse address if street has full address and no separate number
      let street = mapped.street ? String(mapped.street).trim() : null;
      let number = mapped.number ? String(mapped.number).trim() : null;
      let complement = mapped.complement ? String(mapped.complement).trim() : null;
      if (street && !number) {
        const parsed = parseFullAddress(street);
        street = parsed.street;
        number = parsed.number;
        if (parsed.complement && !complement) complement = parsed.complement;
      }

      await prisma.tenant.create({
        data: {
          name: cleanName(String(mapped.name)),
          email: cleanEmail(mapped.email as string),
          phone: cleanPhone(mapped.phone as string),
          cpfCnpj,
          personType: mapped.personType ? String(mapped.personType).toUpperCase().trim() : (cpfCnpj.length > 11 ? "PJ" : "PF"),
          street,
          number,
          complement,
          neighborhood: mapped.neighborhood ? String(mapped.neighborhood).trim() : null,
          city: mapped.city ? String(mapped.city).trim() : null,
          state: mapped.state ? String(mapped.state).toUpperCase().trim() : null,
          zipCode: mapped.zipCode ? String(mapped.zipCode).replace(/\D/g, "").trim() : null,
          rgNumber: mapped.rgNumber ? String(mapped.rgNumber).trim() : null,
          occupation: mapped.occupation ? String(mapped.occupation).trim() : null,
          monthlyIncome: parseNumeric(mapped.monthlyIncome as string),
          notes: mapped.notes ? String(mapped.notes).trim() : null,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: `Erro ao salvar: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    }
  }

  return { imported, errors };
}

async function importProperties(rows: Record<string, unknown>[]): Promise<{ imported: number; errors: ImportError[] }> {
  const errors: ImportError[] = [];
  let imported = 0;
  const columnMap = COLUMN_MAPS.properties;
  const required = REQUIRED_FIELDS.properties;

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], columnMap);
    const rowNum = i + 2;

    for (const field of required) {
      if (!mapped[field] || String(mapped[field]).trim() === "") {
        errors.push({ row: rowNum, field, message: `Campo obrigatorio ausente: ${field}` });
      }
    }
    if (errors.some((e) => e.row === rowNum)) continue;

    // Resolve owner by email or CPF
    let ownerId: string | null = null;
    const ownerEmail = mapped._ownerEmail ? String(mapped._ownerEmail).trim().toLowerCase() : null;
    const ownerCpf = mapped._ownerCpf ? cleanCpfCnpj(mapped._ownerCpf as string) : null;

    if (ownerEmail) {
      const owner = await prisma.owner.findFirst({ where: { email: ownerEmail } });
      if (owner) ownerId = owner.id;
      else {
        errors.push({ row: rowNum, field: "proprietario_email", message: `Proprietario nao encontrado: ${ownerEmail}` });
        continue;
      }
    } else if (ownerCpf) {
      const owner = await findByCpfCnpj("owner", ownerCpf);
      if (owner) ownerId = owner.id;
      else {
        errors.push({ row: rowNum, field: "proprietario_cpf", message: `Proprietario nao encontrado: ${ownerCpf}` });
        continue;
      }
    } else {
      errors.push({ row: rowNum, field: "ownerId", message: "Proprietario (email ou CPF) e obrigatorio" });
      continue;
    }

    const typeMap: Record<string, string> = {
      casa: "CASA", apartamento: "APARTAMENTO", comercial: "COMERCIAL",
      terreno: "TERRENO", sala: "SALA", pavilhao: "PAVILHAO",
    };
    const rawType = String(mapped.type || "").toLowerCase().trim();
    const type = typeMap[rawType] || String(mapped.type).toUpperCase().trim();

    try {
      await prisma.property.create({
        data: {
          title: String(mapped.title).trim(),
          description: mapped.description ? String(mapped.description).trim() : null,
          type,
          status: mapped.status ? String(mapped.status).toUpperCase().trim() : "DISPONIVEL",
          street: String(mapped.street).trim(),
          number: String(mapped.number).trim(),
          complement: mapped.complement ? String(mapped.complement).trim() : null,
          neighborhood: String(mapped.neighborhood).trim(),
          city: String(mapped.city).trim(),
          state: String(mapped.state).toUpperCase().trim(),
          zipCode: String(mapped.zipCode).replace(/\D/g, "").trim(),
          area: parseNumeric(mapped.area as string),
          bedrooms: parseInt2(mapped.bedrooms as string) ?? 0,
          bathrooms: parseInt2(mapped.bathrooms as string) ?? 0,
          parkingSpaces: parseInt2(mapped.parkingSpaces as string) ?? 0,
          furnished: parseBoolean(mapped.furnished as string),
          rentalValue: parseNumeric(mapped.rentalValue as string),
          saleValue: parseNumeric(mapped.saleValue as string),
          condoFee: parseNumeric(mapped.condoFee as string),
          iptuValue: parseNumeric(mapped.iptuValue as string),
          ownerId,
          notes: mapped.notes ? String(mapped.notes).trim() : null,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: `Erro ao salvar: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    }
  }

  return { imported, errors };
}

async function importContracts(rows: Record<string, unknown>[]): Promise<{ imported: number; errors: ImportError[] }> {
  const errors: ImportError[] = [];
  let imported = 0;
  const columnMap = COLUMN_MAPS.contracts;
  const required = REQUIRED_FIELDS.contracts;

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], columnMap);
    const rowNum = i + 2;

    for (const field of required) {
      if (!mapped[field] || String(mapped[field]).trim() === "") {
        errors.push({ row: rowNum, field, message: `Campo obrigatorio ausente: ${field}` });
      }
    }
    if (errors.some((e) => e.row === rowNum)) continue;

    // Resolve property by title
    let propertyId: string | null = null;
    const propertyTitle = mapped._propertyTitle ? String(mapped._propertyTitle).trim() : null;
    if (propertyTitle) {
      const property = await prisma.property.findFirst({ where: { title: { contains: propertyTitle } } });
      if (property) propertyId = property.id;
      else {
        errors.push({ row: rowNum, field: "imovel_titulo", message: `Imovel nao encontrado: ${propertyTitle}` });
        continue;
      }
    } else {
      errors.push({ row: rowNum, field: "imovel_titulo", message: "Imovel (titulo) e obrigatorio" });
      continue;
    }

    // Resolve tenant by email or CPF
    let tenantId: string | null = null;
    const tenantEmail = mapped._tenantEmail ? String(mapped._tenantEmail).trim().toLowerCase() : null;
    const tenantCpf = mapped._tenantCpf ? cleanCpfCnpj(mapped._tenantCpf as string) : null;
    if (tenantEmail) {
      const tenant = await prisma.tenant.findFirst({ where: { email: tenantEmail } });
      if (tenant) tenantId = tenant.id;
      else { errors.push({ row: rowNum, field: "locatario_email", message: `Locatario nao encontrado: ${tenantEmail}` }); continue; }
    } else if (tenantCpf) {
      const tenant = await findByCpfCnpj("tenant", tenantCpf);
      if (tenant) tenantId = tenant.id;
      else { errors.push({ row: rowNum, field: "locatario_cpf", message: `Locatario nao encontrado: ${tenantCpf}` }); continue; }
    } else {
      errors.push({ row: rowNum, field: "tenantId", message: "Locatario (email ou CPF) e obrigatorio" }); continue;
    }

    // Resolve owner by email or CPF
    let ownerId: string | null = null;
    const ownerEmail = mapped._ownerEmail ? String(mapped._ownerEmail).trim().toLowerCase() : null;
    const ownerCpf = mapped._ownerCpf ? cleanCpfCnpj(mapped._ownerCpf as string) : null;
    if (ownerEmail) {
      const owner = await prisma.owner.findFirst({ where: { email: ownerEmail } });
      if (owner) ownerId = owner.id;
      else { errors.push({ row: rowNum, field: "proprietario_email", message: `Proprietario nao encontrado: ${ownerEmail}` }); continue; }
    } else if (ownerCpf) {
      const owner = await findByCpfCnpj("owner", ownerCpf);
      if (owner) ownerId = owner.id;
      else { errors.push({ row: rowNum, field: "proprietario_cpf", message: `Proprietario nao encontrado: ${ownerCpf}` }); continue; }
    } else {
      errors.push({ row: rowNum, field: "ownerId", message: "Proprietario (email ou CPF) e obrigatorio" }); continue;
    }

    const startDate = parseDate(mapped.startDate as string);
    const endDate = parseDate(mapped.endDate as string);
    if (!startDate) { errors.push({ row: rowNum, field: "startDate", message: "Data de inicio invalida" }); continue; }
    if (!endDate) { errors.push({ row: rowNum, field: "endDate", message: "Data de fim invalida" }); continue; }

    const code = String(mapped.code).trim();
    try {
      const existing = await prisma.contract.findUnique({ where: { code } });
      if (existing) { errors.push({ row: rowNum, field: "code", message: `Codigo de contrato ja existe: ${code}` }); continue; }

      await prisma.contract.create({
        data: {
          code,
          type: mapped.type ? String(mapped.type).toUpperCase().trim() : "LOCACAO",
          status: mapped.status ? String(mapped.status).toUpperCase().trim() : "ATIVO",
          propertyId,
          ownerId,
          tenantId,
          rentalValue: parseNumeric(mapped.rentalValue as string) ?? 0,
          adminFeePercent: parseNumeric(mapped.adminFeePercent as string) ?? 10,
          startDate,
          endDate,
          paymentDay: parseInt2(mapped.paymentDay as string) ?? 10,
          guaranteeType: mapped.guaranteeType ? String(mapped.guaranteeType).toUpperCase().trim() : null,
          guaranteeValue: parseNumeric(mapped.guaranteeValue as string),
          adjustmentIndex: mapped.adjustmentIndex ? String(mapped.adjustmentIndex).toUpperCase().trim() : "IGPM",
          adjustmentMonth: parseInt2(mapped.adjustmentMonth as string),
          notes: mapped.notes ? String(mapped.notes).trim() : null,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: `Erro ao salvar: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    }
  }

  return { imported, errors };
}

const VALID_ENTITIES: EntityType[] = ["owners", "tenants", "properties", "contracts"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { entity } = await params;

    if (!VALID_ENTITIES.includes(entity as EntityType)) {
      return NextResponse.json(
        { error: `Entidade invalida: ${entity}. Use: ${VALID_ENTITIES.join(", ")}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const rows = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma linha para importar. Envie { rows: [...] }" },
        { status: 400 }
      );
    }

    if (rows.length > 1000) {
      return NextResponse.json(
        { error: "Maximo de 1000 linhas por importacao" },
        { status: 400 }
      );
    }

    let result: { imported: number; errors: ImportError[] };

    switch (entity as EntityType) {
      case "owners":
        result = await importOwners(rows);
        break;
      case "tenants":
        result = await importTenants(rows);
        break;
      case "properties":
        result = await importProperties(rows);
        break;
      case "contracts":
        result = await importContracts(rows);
        break;
      default:
        return NextResponse.json({ error: "Entidade invalida" }, { status: 400 });
    }

    return NextResponse.json({
      imported: result.imported,
      total: rows.length,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
