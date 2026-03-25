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

      // Calculate fine (multa) - percentage on the original value
      let fineValue = 0;
      if (rules.lateFeePercent > 0) {
        fineValue = payment.value * (rules.lateFeePercent / 100);
      }

      // Calculate late fee (multa por atraso) - fixed 2% of value
      const lateFee = Math.round(payment.value * 0.02 * 100) / 100;

      // Calculate interest (juros) - daily interest rate * days overdue * original value
      // Default: 0.033% per day (1% per month / 30 days)
      let interestValue = 0;
      const dailyRate = rules.dailyInterestPercent > 0 ? rules.dailyInterestPercent : 0.033;
      if (daysOverdue > 0) {
        interestValue = payment.value * (dailyRate / 100) * daysOverdue;
      }

      // Calculate total due: original value + late fee + interest
      const totalDue = Math.round((payment.value + lateFee + interestValue) * 100) / 100;

      totalFinesApplied += fineValue + interestValue + lateFee;

      // Update the payment record
      if (rules.autoMarkOverdue) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "ATRASADO",
            fineValue: fineValue > 0 ? Math.round(fineValue * 100) / 100 : null,
            interestValue: interestValue > 0 ? Math.round(interestValue * 100) / 100 : null,
            lateFee,
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
