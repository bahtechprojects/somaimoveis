// ==================================================
// Templates de mensagens WhatsApp para notificacoes
// ==================================================

interface TemplateResult {
  subject: string;
  message: string;
}

// ---- Locatario: Lembrete de pagamento proximo do vencimento ----
interface PaymentReminderParams {
  tenantName: string;
  value: string;
  propertyTitle: string;
  daysUntilDue: number;
  dueDate: string;
}

export function paymentReminder(params: PaymentReminderParams): TemplateResult {
  return {
    subject: `Lembrete de pagamento - ${params.propertyTitle}`,
    message: `Ola ${params.tenantName}! Lembrete: seu aluguel de ${params.value} referente ao imovel ${params.propertyTitle} vence em ${params.daysUntilDue} dia(s), no dia ${params.dueDate}. Pague em dia para evitar multa e juros.`,
  };
}

// ---- Locatario: Pagamento em atraso ----
interface PaymentOverdueParams {
  tenantName: string;
  value: string;
  propertyTitle: string;
  dueDate: string;
  totalValue: string;
}

export function paymentOverdue(params: PaymentOverdueParams): TemplateResult {
  return {
    subject: `Pagamento em atraso - ${params.propertyTitle}`,
    message: `Ola ${params.tenantName}, seu aluguel de ${params.value} referente ao imovel ${params.propertyTitle} esta vencido desde ${params.dueDate}. Valor atualizado com multa e juros: ${params.totalValue}. Entre em contato para regularizar.`,
  };
}

// ---- Locatario: Confirmacao de pagamento recebido ----
interface PaymentReceivedParams {
  tenantName: string;
  value: string;
  propertyTitle: string;
}

export function paymentReceived(params: PaymentReceivedParams): TemplateResult {
  return {
    subject: `Pagamento confirmado - ${params.propertyTitle}`,
    message: `Ola ${params.tenantName}! Confirmamos o recebimento do pagamento de ${params.value} referente ao aluguel do imovel ${params.propertyTitle}. Obrigado!`,
  };
}

// ---- Locatario: Contrato proximo do vencimento ----
interface ContractExpiringParams {
  tenantName: string;
  propertyTitle: string;
  daysUntilExpiry: number;
}

export function contractExpiring(params: ContractExpiringParams): TemplateResult {
  return {
    subject: `Contrato proximo do vencimento - ${params.propertyTitle}`,
    message: `Ola ${params.tenantName}, seu contrato do imovel ${params.propertyTitle} vence em ${params.daysUntilExpiry} dia(s). Entre em contato com a Somma Imoveis para tratar a renovacao.`,
  };
}

// ---- Proprietario: Pagamento recebido ----
interface OwnerPaymentReceivedParams {
  ownerName: string;
  value: string;
  propertyTitle: string;
  ownerValue: string;
}

export function ownerPaymentReceived(params: OwnerPaymentReceivedParams): TemplateResult {
  return {
    subject: `Pagamento recebido - ${params.propertyTitle}`,
    message: `Ola ${params.ownerName}! O pagamento de ${params.value} do imovel ${params.propertyTitle} foi recebido. Valor do repasse: ${params.ownerValue}.`,
  };
}

// ---- Proprietario: Pagamento em atraso ----
interface OwnerPaymentOverdueParams {
  ownerName: string;
  propertyTitle: string;
  dueDate: string;
}

export function ownerPaymentOverdue(params: OwnerPaymentOverdueParams): TemplateResult {
  return {
    subject: `Pagamento em atraso - ${params.propertyTitle}`,
    message: `Ola ${params.ownerName}, informamos que o pagamento do imovel ${params.propertyTitle} esta em atraso desde ${params.dueDate}. Estamos tomando as providencias.`,
  };
}

// ==================================================
// Mapa de templates por chave
// ==================================================

export type TemplateKey =
  | "payment_reminder"
  | "payment_overdue"
  | "payment_received"
  | "contract_expiring"
  | "owner_payment_received"
  | "owner_payment_overdue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templateMap: Record<TemplateKey, (params: any) => TemplateResult> = {
  payment_reminder: paymentReminder,
  payment_overdue: paymentOverdue,
  payment_received: paymentReceived,
  contract_expiring: contractExpiring,
  owner_payment_received: ownerPaymentReceived,
  owner_payment_overdue: ownerPaymentOverdue,
};

export const templateLabels: Record<TemplateKey, string> = {
  payment_reminder: "Lembrete de Pagamento",
  payment_overdue: "Pagamento em Atraso",
  payment_received: "Pagamento Confirmado",
  contract_expiring: "Contrato Expirando",
  owner_payment_received: "Repasse ao Proprietario",
  owner_payment_overdue: "Atraso (Proprietario)",
};

/**
 * Renderiza um template de mensagem dado a chave e os parametros
 */
export function renderTemplate(
  templateKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateData: Record<string, any>
): TemplateResult {
  const fn = templateMap[templateKey as TemplateKey];
  if (!fn) {
    throw new Error(`Template desconhecido: ${templateKey}`);
  }
  return fn(templateData);
}
