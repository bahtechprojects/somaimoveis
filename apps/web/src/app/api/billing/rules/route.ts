import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { loadBillingRules, saveBillingRules } from "@/lib/billing-rules";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const rules = await loadBillingRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error("Erro ao ler regras de cobranca:", error);
    return NextResponse.json(
      { error: "Erro ao carregar regras de cobranca" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();

    const currentRules = await loadBillingRules();
    const updatedRules = {
      reminderDaysBefore: body.reminderDaysBefore ?? currentRules.reminderDaysBefore,
      gracePeriodDays: body.gracePeriodDays ?? currentRules.gracePeriodDays,
      lateFeePercent: body.lateFeePercent ?? currentRules.lateFeePercent,
      dailyInterestPercent: body.dailyInterestPercent ?? currentRules.dailyInterestPercent,
      escalationSteps: body.escalationSteps ?? currentRules.escalationSteps,
      autoMarkOverdue: body.autoMarkOverdue ?? currentRules.autoMarkOverdue,
      notifyByEmail: body.notifyByEmail ?? currentRules.notifyByEmail,
      notifyBySms: body.notifyBySms ?? currentRules.notifyBySms,
      notifyByWhatsapp: body.notifyByWhatsapp ?? currentRules.notifyByWhatsapp,
    };

    await saveBillingRules(updatedRules);

    return NextResponse.json(updatedRules);
  } catch (error) {
    console.error("Erro ao atualizar regras de cobranca:", error);
    return NextResponse.json(
      { error: "Erro ao salvar regras de cobranca" },
      { status: 500 }
    );
  }
}
