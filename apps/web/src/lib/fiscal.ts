// Tabela progressiva IR 2026 para rendimentos de aluguel (Pessoa Física)
export const IR_TABLE = [
  { min: 0, max: 2259.2, rate: 0, deduction: 0 },
  { min: 2259.21, max: 2826.65, rate: 0.075, deduction: 169.44 },
  { min: 2826.66, max: 3751.05, rate: 0.15, deduction: 381.44 },
  { min: 3751.06, max: 4664.68, rate: 0.225, deduction: 662.77 },
  { min: 4664.69, max: Infinity, rate: 0.275, deduction: 896.0 },
];

export function calculateIRRF(monthlyTaxableIncome: number) {
  if (monthlyTaxableIncome <= 0) {
    return { taxableAmount: 0, rate: 0, deduction: 0, irrfValue: 0 };
  }

  const bracket = IR_TABLE.find(
    (b) => monthlyTaxableIncome >= b.min && monthlyTaxableIncome <= b.max
  ) || IR_TABLE[IR_TABLE.length - 1];

  const irrfValue = Math.max(
    0,
    monthlyTaxableIncome * bracket.rate - bracket.deduction
  );

  return {
    taxableAmount: monthlyTaxableIncome,
    rate: bracket.rate,
    deduction: bracket.deduction,
    irrfValue: Math.round(irrfValue * 100) / 100,
  };
}

export interface FiscalMonthRow {
  month: number;
  label: string;
  grossRental: number;
  adminFee: number;
  netToOwner: number;
  maintenanceCost: number;
  taxableIncome: number;
  irrfRate: number;
  irrfValue: number;
}

export interface FiscalPropertySummary {
  propertyId: string;
  propertyTitle: string;
  months: FiscalMonthRow[];
  annualGross: number;
  annualAdminFee: number;
  annualNet: number;
  annualMaintenance: number;
  annualTaxable: number;
  annualIrrf: number;
}

export interface FiscalReportData {
  ownerId: string;
  ownerName: string;
  ownerCpfCnpj: string;
  personType: string;
  year: number;
  properties: FiscalPropertySummary[];
  totals: {
    grossRental: number;
    adminFee: number;
    netToOwner: number;
    maintenanceCost: number;
    taxableIncome: number;
    totalIrrf: number;
  };
  generatedAt: string;
}

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
