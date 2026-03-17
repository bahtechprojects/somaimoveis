import { prisma } from "@/lib/prisma";

export interface EscalationStep {
  daysAfterDue: number;
  action: string;
  description: string;
}

export interface BillingRules {
  reminderDaysBefore: number[];
  gracePeriodDays: number;
  lateFeePercent: number;
  dailyInterestPercent: number;
  escalationSteps: EscalationStep[];
  autoMarkOverdue: boolean;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notifyByWhatsapp: boolean;
}

export const DEFAULT_RULES: BillingRules = {
  reminderDaysBefore: [5, 3, 1],
  gracePeriodDays: 3,
  lateFeePercent: 2,
  dailyInterestPercent: 0.033,
  escalationSteps: [
    { daysAfterDue: 1, action: "email_reminder", description: "Enviar lembrete por email" },
    { daysAfterDue: 5, action: "sms_reminder", description: "Enviar SMS de cobranca" },
    { daysAfterDue: 10, action: "whatsapp_reminder", description: "Enviar cobranca por WhatsApp" },
    { daysAfterDue: 15, action: "phone_contact", description: "Contato telefonico" },
    { daysAfterDue: 30, action: "formal_notice", description: "Enviar notificacao extrajudicial" },
    { daysAfterDue: 60, action: "legal_action", description: "Encaminhar para assessoria juridica" },
  ],
  autoMarkOverdue: true,
  notifyByEmail: true,
  notifyBySms: false,
  notifyByWhatsapp: true,
};

const RULES_KEY = "billing-rules";

export async function loadBillingRules(): Promise<BillingRules> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: RULES_KEY },
    });
    if (setting?.value) {
      return JSON.parse(setting.value) as BillingRules;
    }
    return DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export async function saveBillingRules(rules: BillingRules): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: RULES_KEY },
    update: { value: JSON.stringify(rules) },
    create: { key: RULES_KEY, value: JSON.stringify(rules) },
  });
}
