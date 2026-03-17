// Shared types and interfaces for Somma

export type UserRole = 'ADMIN' | 'CORRETOR' | 'FINANCEIRO';

export type PropertyStatus = 'DISPONIVEL' | 'ALUGADO' | 'MANUTENCAO' | 'INATIVO';

export type PropertyType = 'CASA' | 'APARTAMENTO' | 'COMERCIAL' | 'TERRENO' | 'SALA' | 'GALPAO';

export type ContractStatus = 'ATIVO' | 'ENCERRADO' | 'PENDENTE_RENOVACAO' | 'CANCELADO';

export type ContractType = 'LOCACAO' | 'VENDA' | 'TEMPORADA';

export type GuaranteeType = 'FIADOR' | 'CAUCAO' | 'SEGURO_FIANCA' | 'TITULO_CAPITALIZACAO' | 'SEM_GARANTIA';

export type PaymentStatus = 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO' | 'PARCIAL';

export type PaymentMethod = 'BOLETO' | 'PIX' | 'CARTAO' | 'TRANSFERENCIA' | 'DINHEIRO';

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}
