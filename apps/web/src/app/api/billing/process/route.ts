import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { loadBillingRules } from "@/lib/billing-rules";

export async function POST(_request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const rules = await loadBillingRules();
    const now = new Date();

    // Calculate the cutoff date: payments due before (now - gracePeriodDays) are overdue
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - rules.gracePeriodDays);

    // Find all pending payments where dueDate is before the cutoff
    const overduePayments = await prisma.payment.findMany({
      where: {
        status: "PENDENTE",
        dueDate: {
          lt: cutoffDate,
        },
      },
    });

    let markedOverdue = 0;
    let totalFinesApplied = 0;

    for (const payment of overduePayments) {
      // Calculate days overdue from the due date (not from cutoff)
      const dueDate = new Date(payment.dueDate);
      const diffMs = now.getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Multa (fine): percentual unico sobre o valor original (padrao 2%)
      // Art. 52 CDC: multa maxima 2% sobre o valor da prestacao
      const finePercent = rules.lateFeePercent > 0 ? rules.lateFeePercent : 2;
      const fineValue = Math.round(payment.value * (finePercent / 100) * 100) / 100;

      // Juros de mora: taxa diaria * dias de atraso * valor original
      // Padrao: 0.033% ao dia (1% ao mes / 30 dias)
      let interestValue = 0;
      const dailyRate = rules.dailyInterestPercent > 0 ? rules.dailyInterestPercent : 0.033;
      if (daysOverdue > 0) {
        interestValue = Math.round(payment.value * (dailyRate / 100) * daysOverdue * 100) / 100;
      }

      // Total = valor original + multa + juros
      const totalDue = Math.round((payment.value + fineValue + interestValue) * 100) / 100;

      totalFinesApplied += fineValue + interestValue;

      // Update the payment record
      if (rules.autoMarkOverdue) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "ATRASADO",
            fineValue: fineValue > 0 ? fineValue : null,
            interestValue: interestValue > 0 ? interestValue : null,
            lateFee: fineValue, // lateFee = multa (mesmo valor, mantido por compatibilidade)
            totalDue,
          },
        });
        markedOverdue++;
      }
    }

    return NextResponse.json({
      processed: overduePayments.length,
      markedOverdue,
      totalFinesApplied: Math.round(totalFinesApplied * 100) / 100,
    });
  } catch (error) {
    console.error("Erro ao processar cobrancas:", error);
    return NextResponse.json(
      { error: "Erro ao processar cobrancas" },
      { status: 500 }
    );
  }
}
