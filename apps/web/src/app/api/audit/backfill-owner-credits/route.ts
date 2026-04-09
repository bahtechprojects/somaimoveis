import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/backfill-owner-credits
 * Lista lançamentos do locatário com destino=PROPRIETARIO que NÃO têm crédito correspondente no proprietário.
 *
 * POST /api/audit/backfill-owner-credits
 * Cria os créditos no proprietário para todos os lançamentos faltantes.
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Buscar todos os lançamentos de locatário com destino PROPRIETARIO
  // DEBITO locatário → CREDITO proprietário (ex: IPTU cobrado do inquilino)
  // CREDITO locatário → DEBITO proprietário (ex: desconto dado ao inquilino)
  const tenantEntries = await prisma.tenantEntry.findMany({
    where: {
      destination: "PROPRIETARIO",
      status: { not: "CANCELADO" },
    },
    include: {
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Para cada entry, verificar se já existe OwnerEntry correspondente (via notes)
  const missing = [];
  const existing = [];

  for (const entry of tenantEntries) {
    // Buscar OwnerEntry que referencia este TenantEntry
    // Tipo do owner entry: locatário DEBITO → owner CREDITO, locatário CREDITO → owner DEBITO
    const ownerEntryType = entry.type === "DEBITO" ? "CREDITO" : "DEBITO";
    const ownerEntry = await prisma.ownerEntry.findFirst({
      where: {
        notes: { contains: entry.id },
        type: ownerEntryType,
      },
    });

    // Resolver ownerId via contractId
    let ownerId: string | null = null;
    let ownerName = "";
    let propertyId: string | null = null;

    if (entry.contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: entry.contractId },
        select: { ownerId: true, propertyId: true, code: true, owner: { select: { name: true } } },
      });
      if (contract) {
        ownerId = contract.ownerId;
        ownerName = contract.owner.name;
        propertyId = contract.propertyId;
      }
    }

    // Se não tem contractId, buscar via tenant → contratos ativos
    if (!ownerId) {
      const contracts = await prisma.contract.findMany({
        where: {
          tenantId: entry.tenantId,
          status: "ATIVO",
        },
        select: { ownerId: true, propertyId: true, code: true, owner: { select: { name: true } } },
        take: 1,
      });
      if (contracts.length > 0) {
        ownerId = contracts[0].ownerId;
        ownerName = contracts[0].owner.name;
        propertyId = contracts[0].propertyId;
      }
    }

    const item = {
      tenantEntryId: entry.id,
      tenant: entry.tenant.name,
      category: entry.category,
      description: entry.description,
      value: entry.value,
      dueDate: entry.dueDate,
      status: entry.status,
      ownerId,
      ownerName,
      contractId: entry.contractId,
      propertyId: propertyId || entry.propertyId,
    };

    if (ownerEntry) {
      existing.push({ ...item, ownerEntryId: ownerEntry.id });
    } else if (ownerId) {
      missing.push(item);
    }
  }

  return NextResponse.json({
    total: tenantEntries.length,
    missing: missing.length,
    alreadyMapped: existing.length,
    entries: missing,
  });
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Buscar lançamentos do locatário com destino PROPRIETARIO (DEBITO e CREDITO)
  const tenantEntries = await prisma.tenantEntry.findMany({
    where: {
      destination: "PROPRIETARIO",
      status: { not: "CANCELADO" },
    },
    include: {
      tenant: { select: { name: true } },
    },
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of tenantEntries) {
    // Verificar se já existe
    const ownerEntryType = entry.type === "DEBITO" ? "CREDITO" : "DEBITO";
    const existing = await prisma.ownerEntry.findFirst({
      where: {
        notes: { contains: entry.id },
        type: ownerEntryType,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Resolver ownerId
    let ownerId: string | null = null;
    let propertyId: string | null = null;
    let contractCode = "";

    if (entry.contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: entry.contractId },
        select: { ownerId: true, propertyId: true, code: true },
      });
      if (contract) {
        ownerId = contract.ownerId;
        propertyId = contract.propertyId;
        contractCode = contract.code;
      }
    }

    if (!ownerId) {
      const contracts = await prisma.contract.findMany({
        where: { tenantId: entry.tenantId, status: "ATIVO" },
        select: { ownerId: true, propertyId: true, code: true },
        take: 1,
      });
      if (contracts.length > 0) {
        ownerId = contracts[0].ownerId;
        propertyId = contracts[0].propertyId;
        contractCode = contracts[0].code;
      }
    }

    if (!ownerId) {
      errors.push(`${entry.id}: sem proprietário encontrado para locatário ${entry.tenant.name}`);
      continue;
    }

    // Determinar categoria e label
    const categoryMap: Record<string, string> = {
      IPTU: "IPTU",
      CONDOMINIO: "CONDOMINIO",
    };
    const ownerCategory = categoryMap[entry.category] || entry.category;

    // Formatar mês para descrição
    const dueDate = entry.dueDate || new Date();
    const d = new Date(dueDate);
    const mLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    // Buscar co-proprietários do imóvel
    const ownerShares = propertyId
      ? await prisma.propertyOwner.findMany({ where: { propertyId } })
      : [];

    // Locatário DEBITO → Owner CREDITO | Locatário CREDITO → Owner DEBITO
    const ownerType = entry.type === "DEBITO" ? "CREDITO" : "DEBITO";
    const descLabel = ownerType === "DEBITO"
      ? `${entry.description || ownerCategory}`
      : ownerCategory;

    const baseNotes = {
      tenantEntryId: entry.id,
      originalDescription: entry.description,
      destination: "PROPRIETARIO",
      type: ownerType === "DEBITO" ? "desconto_locatario" : undefined,
      backfilledAt: new Date().toISOString(),
    };

    if (ownerShares.length > 0) {
      // Split por co-proprietários
      const totalSharePct = ownerShares.reduce((s, sh) => s + sh.percentage, 0);

      for (const share of ownerShares) {
        const portion = Math.round(entry.value * (share.percentage / 100) * 100) / 100;
        await prisma.ownerEntry.create({
          data: {
            type: ownerType,
            category: ownerCategory,
            description: `${descLabel} ${mLabel} - ${contractCode || "manual"} (${share.percentage}%)`,
            value: portion,
            dueDate: entry.dueDate,
            status: "PENDENTE",
            ownerId: share.ownerId,
            contractId: entry.contractId,
            propertyId: propertyId || entry.propertyId,
            notes: JSON.stringify(baseNotes),
          },
        });
      }

      // Proprietário principal recebe o restante se soma < 100%
      const contractOwnerInShares = ownerShares.some(s => s.ownerId === ownerId);
      if (totalSharePct < 100 && !contractOwnerInShares) {
        const remainPct = Math.round((100 - totalSharePct) * 100) / 100;
        const remainVal = Math.round(entry.value * (remainPct / 100) * 100) / 100;
        await prisma.ownerEntry.create({
          data: {
            type: ownerType,
            category: ownerCategory,
            description: `${descLabel} ${mLabel} - ${contractCode || "manual"} (${remainPct}%)`,
            value: remainVal,
            dueDate: entry.dueDate,
            status: "PENDENTE",
            ownerId,
            contractId: entry.contractId,
            propertyId: propertyId || entry.propertyId,
            notes: JSON.stringify(baseNotes),
          },
        });
      }
    } else {
      // Proprietário único
      await prisma.ownerEntry.create({
        data: {
          type: ownerType,
          category: ownerCategory,
          description: `${descLabel} ${mLabel} - ${contractCode || "manual"}`,
          value: entry.value,
          dueDate: entry.dueDate,
          status: "PENDENTE",
          ownerId,
          contractId: entry.contractId,
          propertyId: propertyId || entry.propertyId,
          notes: JSON.stringify(baseNotes),
        },
      });
    }
    created++;
  }

  return NextResponse.json({
    created,
    skipped,
    errors,
    message: `${created} crédito(s) criado(s) para proprietários. ${skipped} já existiam. ${errors.length} erro(s).`,
  });
}
