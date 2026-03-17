import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPortalToken } from "@/lib/portal-auth";

export async function GET(request: NextRequest) {
  const auth = await verifyPortalToken(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Nao autorizado" },
      { status: 401 }
    );
  }

  try {
    const { ownerId } = auth;

    // Total de imoveis do proprietario
    const totalProperties = await prisma.property.count({
      where: { ownerId, active: true },
    });

    // Contratos ativos
    const activeContracts = await prisma.contract.count({
      where: { ownerId, status: "ATIVO" },
    });

    // Renda mensal total (soma dos valores de aluguel dos contratos ativos)
    const activeContractsList = await prisma.contract.findMany({
      where: { ownerId, status: "ATIVO" },
      select: { rentalValue: true, adminFeePercent: true },
    });

    const totalMonthlyIncome = activeContractsList.reduce(
      (sum, c) => sum + c.rentalValue,
      0
    );

    const totalMonthlyOwnerIncome = activeContractsList.reduce(
      (sum, c) => sum + c.rentalValue * (1 - c.adminFeePercent / 100),
      0
    );

    // Pagamentos pendentes e atrasados
    const pendingPayments = await prisma.payment.count({
      where: { ownerId, status: "PENDENTE" },
    });

    const overduePayments = await prisma.payment.count({
      where: { ownerId, status: "ATRASADO" },
    });

    // Ultimos 5 pagamentos
    const recentPayments = await prisma.payment.findMany({
      where: { ownerId },
      include: {
        contract: {
          include: {
            property: { select: { title: true } },
          },
        },
        tenant: { select: { name: true } },
      },
      orderBy: { dueDate: "desc" },
      take: 5,
    });

    return NextResponse.json({
      totalProperties,
      activeContracts,
      totalMonthlyIncome,
      totalMonthlyOwnerIncome,
      pendingPayments,
      overduePayments,
      recentPayments,
    });
  } catch (error) {
    console.error("Erro ao buscar dashboard do portal:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do dashboard" },
      { status: 500 }
    );
  }
}
