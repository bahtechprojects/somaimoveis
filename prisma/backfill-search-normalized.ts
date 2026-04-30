/**
 * Backfill nameNormalized / titleNormalized para registros existentes.
 *
 * Roda uma vez apos a migration que adicionou as colunas. Pode rodar
 * de novo a qualquer momento — eh idempotente.
 *
 * Uso: pnpm tsx prisma/backfill-search-normalized.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function main() {
  console.log("[Backfill] Iniciando...");

  // Owners
  const owners = await prisma.owner.findMany({ select: { id: true, name: true } });
  let updatedOwners = 0;
  for (const o of owners) {
    await prisma.owner.update({
      where: { id: o.id },
      data: { nameNormalized: normalize(o.name) },
    });
    updatedOwners++;
  }
  console.log(`[Backfill] Owners: ${updatedOwners} atualizados`);

  // Tenants
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let updatedTenants = 0;
  for (const t of tenants) {
    await prisma.tenant.update({
      where: { id: t.id },
      data: { nameNormalized: normalize(t.name) },
    });
    updatedTenants++;
  }
  console.log(`[Backfill] Tenants: ${updatedTenants} atualizados`);

  // Properties
  const properties = await prisma.property.findMany({ select: { id: true, title: true } });
  let updatedProperties = 0;
  for (const p of properties) {
    await prisma.property.update({
      where: { id: p.id },
      data: { titleNormalized: normalize(p.title) },
    });
    updatedProperties++;
  }
  console.log(`[Backfill] Properties: ${updatedProperties} atualizados`);

  console.log("[Backfill] Concluido!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
