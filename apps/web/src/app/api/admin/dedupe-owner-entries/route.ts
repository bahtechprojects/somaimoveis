import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { isAdmin } from "@/lib/rbac";

/**
 * GET /api/admin/dedupe-owner-entries
 *
 * Limpa lancamentos de proprietario duplicados criados por re-geracao de
 * cobrancas. Mantem o mais antigo de cada grupo (mais provavel de ja ter
 * sido conferido), descarta os demais.
 *
 * Identifica duplicata pelo conjunto:
 *  - ownerId + contractId + dueDate + description + type + value
 *  - status = PENDENTE
 *
 * Apenas ADMIN pode rodar. Idempotente.
 */
export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!isAdmin(auth.user.role)) {
    return NextResponse.json(
      { error: "Apenas administradores podem rodar este script" },
      { status: 403 },
    );
  }

  const allEntries = await prisma.ownerEntry.findMany({
    where: { status: "PENDENTE" },
    select: {
      id: true,
      ownerId: true,
      contractId: true,
      dueDate: true,
      description: true,
      type: true,
      value: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Agrupa por chave de duplicata
  const groups = new Map<string, typeof allEntries>();
  for (const entry of allEntries) {
    const key = [
      entry.ownerId,
      entry.contractId || "null",
      entry.dueDate?.toISOString() || "null",
      entry.description,
      entry.type,
      entry.value.toFixed(2),
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  // Identifica IDs a deletar (manter o primeiro de cada grupo, descartar resto)
  const idsToDelete: string[] = [];
  let groupsWithDupes = 0;
  for (const [, entries] of groups) {
    if (entries.length > 1) {
      groupsWithDupes++;
      // Mantem o primeiro (mais antigo), descarta os demais
      for (let i = 1; i < entries.length; i++) {
        idsToDelete.push(entries[i].id);
      }
    }
  }

  if (idsToDelete.length === 0) {
    return NextResponse.json({
      message: "Nenhuma duplicata encontrada.",
      deleted: 0,
      groupsAnalyzed: groups.size,
    });
  }

  // Deleta em lote
  const result = await prisma.ownerEntry.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  return NextResponse.json({
    message: `Deduplicado: ${result.count} lancamentos removidos de ${groupsWithDupes} grupos com duplicatas.`,
    deleted: result.count,
    groupsAnalyzed: groups.size,
    groupsWithDupes,
  });
}
