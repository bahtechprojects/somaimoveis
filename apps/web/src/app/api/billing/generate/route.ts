import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const monthStr = body.month as string | undefined;

    // Determine target month
    let targetYear: number;
    let targetMonth: number; // 0-indexed

    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      // Default: next month
      const now = new Date();
      targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      targetMonth = (now.getMonth() + 1) % 12;
    }

    // Month range for duplicate check
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // Find active contracts that cover the target month
    const contracts = await prisma.contract.findMany({
      where: {
        status: "ATIVO",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: {
        property: { select: { title: true } },
        tenant: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    if (contracts.length === 0) {
      return NextResponse.json({
        generated: 0,
        skipped: 0,
        errors: [],
        message: "Nenhum contrato ativo encontrado para este periodo.",
      });
    }

    // Find existing payments for this month to avoid duplicates
    const existingPayments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const existingContractIds = new Set(existingPayments.map((p) => p.contractId));

    // Get the last payment code to continue sequence
    const lastPayment = await prisma.payment.findFirst({
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let nextNumber = 1;
    if (lastPayment?.code) {
      const match = lastPayment.code.match(/PAG-(\d+)/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }

    let generated = 0;
    let skipped = 0;
    const errors: { contract: string; message: string }[] = [];

    for (const contract of contracts) {
      // Skip if payment already exists for this contract+month
      if (existingContractIds.has(contract.id)) {
        skipped++;
        continue;
      }

      try {
        // Calculate due date using paymentDay
        let paymentDay = contract.paymentDay || 10;
        // Clamp to last day of month if needed
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        if (paymentDay > lastDayOfMonth) paymentDay = lastDayOfMonth;

        const dueDate = new Date(targetYear, targetMonth, paymentDay, 12, 0, 0);

        // Calculate split values
        const adminFee = contract.adminFeePercent || 10;
        const splitAdminValue = Math.round(contract.rentalValue * (adminFee / 100) * 100) / 100;
        const splitOwnerValue = Math.round((contract.rentalValue - splitAdminValue) * 100) / 100;

        const code = `PAG-${String(nextNumber).padStart(3, "0")}`;
        nextNumber++;

        await prisma.payment.create({
          data: {
            code,
            contractId: contract.id,
            tenantId: contract.tenantId,
            ownerId: contract.ownerId,
            value: contract.rentalValue,
            dueDate,
            status: "PENDENTE",
            splitAdminValue,
            splitOwnerValue,
            description: `Aluguel ${String(targetMonth + 1).padStart(2, "0")}/${targetYear} - ${contract.code}`,
          },
        });

        generated++;
      } catch (err) {
        errors.push({
          contract: contract.code,
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    const monthLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    return NextResponse.json({
      generated,
      skipped,
      errors,
      month: monthLabel,
      message: generated > 0
        ? `${generated} cobranca(s) gerada(s) para ${monthLabel}.${skipped > 0 ? ` ${skipped} ja existiam.` : ""}`
        : `Nenhuma cobranca gerada. ${skipped} ja existiam para ${monthLabel}.`,
    });
  } catch (error) {
    console.error("Erro ao gerar cobrancas:", error);
    return NextResponse.json(
      { error: "Erro ao gerar cobrancas" },
      { status: 500 }
    );
  }
}

// GET: Preview - shows which contracts would generate charges
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number;
    let targetMonth: number;

    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      targetMonth = (now.getMonth() + 1) % 12;
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const contracts = await prisma.contract.findMany({
      where: {
        status: "ATIVO",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: {
        property: { select: { title: true } },
        tenant: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    const existingPayments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const existingContractIds = new Set(existingPayments.map((p) => p.contractId));

    const preview = contracts.map((c) => ({
      contractCode: c.code,
      property: c.property.title,
      tenant: c.tenant.name,
      owner: c.owner.name,
      value: c.rentalValue,
      paymentDay: c.paymentDay,
      alreadyExists: existingContractIds.has(c.id),
    }));

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      total: contracts.length,
      pending: contracts.length - existingContractIds.size,
      existing: existingContractIds.size,
      contracts: preview,
    });
  } catch (error) {
    console.error("Erro ao carregar preview:", error);
    return NextResponse.json(
      { error: "Erro ao carregar preview" },
      { status: 500 }
    );
  }
}
