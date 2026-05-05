import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { isAdmin } from "@/lib/rbac";

/**
 * GET /api/admin/seed-fiscal-settings
 *
 * Pre-popula a tabela FiscalSettings com os dados da Somma fornecidos
 * pelo Leo + contadora. Idempotente — sobrescreve apenas campos que
 * estiverem vazios.
 *
 * Apenas ADMIN.
 */
export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!isAdmin(auth.user.role)) {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let existing = await prisma.fiscalSettings.findFirst();
  if (!existing) {
    existing = await prisma.fiscalSettings.create({ data: {} });
  }

  // Dados oficiais informados pelo Leo + contadora
  const data: Record<string, unknown> = {};
  if (!existing.razaoSocial) data.razaoSocial = "SOMMA IMOVEIS LTDA";
  if (!existing.cnpj) data.cnpj = "40.528.068/0001-62";
  if (!existing.inscricaoMunicipal) data.inscricaoMunicipal = "415551";
  if (!existing.cnae) data.cnae = "6822-6/00";
  if (!existing.codigoServicoMunicipal) data.codigoServicoMunicipal = "10.05";
  if (existing.aliquotaIss == null) data.aliquotaIss = 2;
  if (!existing.regimeTributario) data.regimeTributario = "SIMPLES_NACIONAL";
  if (!existing.optanteSimples) data.optanteSimples = true;
  if (!existing.street) data.street = "Rua Tenente Coronel Brito";
  if (!existing.number) data.number = "138";
  if (!existing.complement) data.complement = "Loja 02";
  if (!existing.neighborhood) data.neighborhood = "Centro";
  if (!existing.city) data.city = "Santa Cruz do Sul";
  if (!existing.state) data.state = "RS";
  if (!existing.zipCode) data.zipCode = "96810-202";
  if (!existing.provedor) data.provedor = "NFSE_NACIONAL";
  if (!existing.ambiente) data.ambiente = "HOMOLOGACAO";

  if (Object.keys(data).length === 0) {
    return NextResponse.json({
      message: "Nenhum campo para preencher (todos ja tem valor).",
      current: {
        razaoSocial: existing.razaoSocial,
        cnpj: existing.cnpj,
        inscricaoMunicipal: existing.inscricaoMunicipal,
        codigoServicoMunicipal: existing.codigoServicoMunicipal,
        aliquotaIss: existing.aliquotaIss,
        regimeTributario: existing.regimeTributario,
      },
    });
  }

  const updated = await prisma.fiscalSettings.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({
    message: `${Object.keys(data).length} campo(s) preenchido(s).`,
    fieldsUpdated: Object.keys(data),
    current: {
      razaoSocial: updated.razaoSocial,
      cnpj: updated.cnpj,
      inscricaoMunicipal: updated.inscricaoMunicipal,
      codigoServicoMunicipal: updated.codigoServicoMunicipal,
      aliquotaIss: updated.aliquotaIss,
      regimeTributario: updated.regimeTributario,
    },
  });
}
