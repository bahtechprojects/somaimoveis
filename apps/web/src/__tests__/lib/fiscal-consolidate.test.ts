import { describe, it, expect } from "vitest";
import { distributeIRRF } from "@/lib/fiscal-consolidate";
import { calculateIRRF } from "@/lib/fiscal";

describe("distributeIRRF", () => {
  it("retorna lista vazia quando nao ha bases", () => {
    expect(distributeIRRF([], 100)).toEqual([]);
  });

  it("retorna zeros quando IRRF total e zero", () => {
    expect(distributeIRRF([1000, 2000, 500], 0)).toEqual([0, 0, 0]);
  });

  it("retorna zeros quando soma das bases e zero", () => {
    expect(distributeIRRF([0, 0, 0], 100)).toEqual([0, 0, 0]);
  });

  it("atribui IRRF inteiro a um unico payment", () => {
    expect(distributeIRRF([3000], 155.84)).toEqual([155.84]);
  });

  it("distribui proporcionalmente em 2 boletos iguais", () => {
    const result = distributeIRRF([2000, 2000], 200);
    expect(result).toEqual([100, 100]);
  });

  it("distribui proporcionalmente em 2 boletos distintos", () => {
    // soma = 4000; partes = 1000 (25%) e 3000 (75%)
    // IRRF total = 100 -> 25 + 75 = 100
    const result = distributeIRRF([1000, 3000], 100);
    expect(result.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2);
    expect(result[1]).toBeGreaterThan(result[0]);
  });

  it("absorve drift de centavos no maior payment", () => {
    // 3 partes iguais de R$ 333,34 com IRRF total R$ 100,01
    // 100,01 / 3 = 33,336666... → arredonda 33,34 cada → 100,02 (drift +0,01)
    // O maior absorve o resto: 33,33 + 33,34 + 33,34 = 100,01
    const result = distributeIRRF([333.34, 333.34, 333.34], 100.01);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100)).toBe(Math.round(100.01 * 100));
  });

  it("preserva ordem original do array (nao reordena resultado)", () => {
    // [200, 800] com IRRF 100 → [20, 80] na mesma ordem
    const result = distributeIRRF([200, 800], 100);
    expect(result[0]).toBe(20);
    expect(result[1]).toBe(80);
  });

  it("3 boletos com 33% cada sobre R$ 1.000,01 sem drift", () => {
    // grossList = [333.34, 333.34, 333.33] soma = 1000.01
    // IRRF arbitrario: 200.01 → distribuir
    const result = distributeIRRF([333.34, 333.34, 333.33], 200.01);
    const sum = Math.round(result.reduce((s, v) => s + v, 0) * 100) / 100;
    expect(sum).toBe(200.01);
  });
});

describe("calculateIRRF — casos da Roberta e similares", () => {
  it("R$ 2.166,66 em 2025: isento (abaixo do piso 2.259,20)", () => {
    const r = calculateIRRF(2166.66, new Date("2025-06-01"));
    expect(r.irrfValue).toBe(0);
  });

  it("R$ 2.166,66 em 2026: isento (Lei 15.270/2025, piso R$ 5.000)", () => {
    const r = calculateIRRF(2166.66, new Date("2026-06-01"));
    expect(r.irrfValue).toBe(0);
  });

  it("R$ 4.000 em 2025: aplica tabela 22,5%", () => {
    const r = calculateIRRF(4000, new Date("2025-06-01"));
    expect(r.rate).toBe(0.225);
    // 4000 * 0.225 - 662.77 = 237.23
    expect(r.irrfValue).toBeCloseTo(237.23, 2);
  });

  it("R$ 4.000 em 2026: isento (abaixo dos R$ 5.000)", () => {
    const r = calculateIRRF(4000, new Date("2026-06-01"));
    expect(r.irrfValue).toBe(0);
  });

  it("R$ 6.000 em 2026 (faixa de transicao): aplica reducao parcial", () => {
    const r = calculateIRRF(6000, new Date("2026-06-01"));
    // 6000 * 0.275 - 896 = 754
    // reducao = 978.62 - 0.133145 * 6000 = 978.62 - 798.87 = 179.75
    // IRRF final = 754 - 179.75 = 574.25
    expect(r.irrfValue).toBeGreaterThan(0);
    expect(r.irrfValue).toBeLessThan(754);
  });

  it("R$ 8.000 em 2026 (acima da transicao): tabela normal", () => {
    const r = calculateIRRF(8000, new Date("2026-06-01"));
    // 8000 * 0.275 - 896 = 1304
    expect(r.irrfValue).toBeCloseTo(1304, 2);
  });
});
