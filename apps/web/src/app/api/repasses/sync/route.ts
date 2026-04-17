import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/repasses/sync?month=YYYY-MM
 * Sincroniza os repasses para todos os pagamentos PAGO do mes que ainda nao
 * tem uma OwnerEntry REPASSE correspondente. Util para corrigir pagamentos
 * legados ou criados manualmente fora do fluxo /api/billing/generate.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number, targetMonth: number;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // Buscar todos os pagamentos PAGO do mes com contratoId e ownerId
    const payments = await prisma.payment.findMany({
      where: {
        status: "PAGO",
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        code: true,
        contractId: true,
        ownerId: true,
        dueDate: true,
        value: true,
        splitOwnerValue: true,
        splitAdminValue: true,
        netToOwner: true,
        irrfValue: true,
        irrfRate: true,
      },
    });

    let criados = 0;
    const detalhes: { payment: string; result: string }[] = [];

    for (const p of payments) {
      if (!p.contractId || !p.ownerId || !p.dueDate) continue;

      const existing = await prisma.ownerEntry.findFirst({
        where: {
          contractId: p.contractId,
          dueDate: p.dueDate,
          category: "REPASSE",
        },
      });

      if (existing) {
        continue;
      }

      // Calcular valor do repasse
      const splitValue = p.splitOwnerValue ?? p.netToOwner ?? 0;
      const ownerValue = splitValue > 0
        ? splitValue
        : Math.max(0, (p.value || 0) - (p.splitAdminValue || 0));

      if (ownerValue <= 0) {
        detalhes.push({ payment: p.code, result: "Valor do repasse zerado, ignorado" });
        continue;
      }

      const contract = await prisma.contract.findUnique({
        where: { id: p.contractId },
        select: {
          code: true,
          rentalValue: true,
          adminFeePercent: true,
          propertyId: true,
        },
      });

      const d = new Date(p.dueDate);
      const mLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

      const notesData = {
        aluguelBruto: contract?.rentalValue || p.value,
        adminFeePercent: contract?.adminFeePercent || 10,
        adminFeeValue: p.splitAdminValue || 0,
        irrfValue: p.irrfValue || undefined,
        irrfRate: p.irrfRate || undefined,
        netToOwner: p.netToOwner || ownerValue,
        autoCreated: true,
        syncedFromPayment: p.code,
      };

      await prisma.ownerEntry.create({
        data: {
          type: "CREDITO",
          category: "REPASSE",
          description: `Repasse aluguel ${mLabel} - ${contract?.code || p.contractId}`,
          value: ownerValue,
          dueDate: p.dueDate,
          status: "PENDENTE",
          ownerId: p.ownerId,
          contractId: p.contractId,
          propertyId: contract?.propertyId || null,
          notes: JSON.stringify(notesData),
        },
      });

      criados++;
      detalhes.push({ payment: p.code, result: `Repasse criado: R$ ${ownerValue.toFixed(2)}` });
    }

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      totalPagamentos: payments.length,
      repassesCriados: criados,
      mensagem:
        criados === 0
          ? "Nenhum repasse criado. Todos os pagamentos PAGO ja tem repasse correspondente."
          : `${criados} repasse(s) criado(s) com sucesso.`,
      detalhes,
    });
  } catch (error) {
    console.error("[Repasses Sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar repasses" },
      { status: 500 }
    );
  }
}
