"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Reajuste {
  contractId: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string | null;
  aniversarioDate: string;
  lastAdjustmentDate: string | null;
  lastAdjustmentPercent: number | null;
  adjustmentIndex: string | null;
  mesesDesdeUltimoReajuste: number;
  rentalValue: number;
  property: { id: string; title: string } | null;
  owner: { id: string; name: string; cpfCnpj: string } | null;
  tenant: { id: string; name: string; cpfCnpj: string } | null;
}

interface Data {
  month: string;
  totais: {
    total: number;
    totalAluguelAtual: number;
  };
  reajustes: Reajuste[];
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function RelatorioContent() {
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = monthParam || defaultMonth;

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/relatorios/reajustes?month=${month}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Carregando relatorio...</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">Erro ao carregar.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="relatorio-page">
      <style>{styles}</style>
      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>

      <div className="header-bar">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Reajustes a Aplicar - {data.month}</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Competencia: {data.month}</div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-card">
          <div className="label">Contratos a Reajustar</div>
          <div className="value">{data.totais.total}</div>
        </div>
        <div className="summary-card">
          <div className="label">Aluguel Atual (Soma)</div>
          <div className="value">{formatCurrency(data.totais.totalAluguelAtual)}</div>
        </div>
      </div>

      {data.reajustes.length === 0 ? (
        <div className="empty">
          <p>Nenhum contrato para reajustar em {data.month}.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Imovel</th>
              <th>Proprietario</th>
              <th>Locatario</th>
              <th>Inicio</th>
              <th>Ult. Reajuste</th>
              <th>Aniversario</th>
              <th>Indice</th>
              <th>Ult. %</th>
              <th className="right">Aluguel Atual</th>
            </tr>
          </thead>
          <tbody>
            {data.reajustes.map((r) => (
              <tr key={r.contractId}>
                <td className="bold">{r.code}</td>
                <td>{r.property?.title || "-"}</td>
                <td>
                  {r.owner?.name || "-"}
                  {r.owner?.cpfCnpj && <div className="secondary">{r.owner.cpfCnpj}</div>}
                </td>
                <td>{r.tenant?.name || "-"}</td>
                <td>{formatDate(r.startDate)}</td>
                <td>{formatDate(r.lastAdjustmentDate)}</td>
                <td className="bold">{formatDate(r.aniversarioDate)}</td>
                <td>
                  <span className="badge-index">{r.adjustmentIndex || "IGPM"}</span>
                </td>
                <td>
                  {r.lastAdjustmentPercent != null
                    ? `${r.lastAdjustmentPercent.toFixed(2)}%`
                    : "-"}
                </td>
                <td className="right bold">{formatCurrency(r.rentalValue)}</td>
              </tr>
            ))}
            <tr className="totals-row">
              <td colSpan={9} style={{ textAlign: "right" }}>
                TOTAL ALUGUEL ATUAL:
              </td>
              <td className="right">{formatCurrency(data.totais.totalAluguelAtual)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="notes-box">
        <strong>Instrucoes:</strong>
        <p style={{ margin: "4px 0 0" }}>
          Os contratos listados acima atingem a data de aniversario anual em{" "}
          <strong>{data.month}</strong> e completam pelo menos 11 meses desde o ultimo reajuste.
          Consulte o indice oficial vigente (IGPM/IPCA/INPC) acumulado dos ultimos 12 meses para
          calcular o novo valor. Apos aplicar, atualize o contrato com a nova data e percentual de
          reajuste.
        </p>
      </div>

      <div className="footer">
        <p>Somma Imoveis - Reajustes a Aplicar</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

const styles = `
  @media print {
    body { margin: 0; padding: 0; }
    .no-print { display: none !important; }
    .relatorio-page { padding: 15px; }
    @page { size: A4 landscape; margin: 12mm; }
  }
  @media screen {
    .relatorio-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 30px;
    }
  }
  .relatorio-page {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    line-height: 1.4;
  }
  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #16a34a;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .header-bar h1 {
    font-size: 22px;
    font-weight: 700;
    color: #16a34a;
    margin: 0;
  }
  .header-bar .subtitle { font-size: 13px; color: #666; margin: 2px 0 0; }
  .header-right { text-align: right; font-size: 11px; color: #888; }
  .summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .summary-card {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 10px 14px;
  }
  .summary-card .label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .summary-card .value {
    font-size: 20px;
    font-weight: 700;
    margin-top: 2px;
    color: #16a34a;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table th {
    background: #16a34a;
    color: white;
    padding: 7px 8px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table th.right { text-align: right; }
  table td {
    border-bottom: 1px solid #e5e7eb;
    padding: 6px 8px;
    vertical-align: top;
  }
  table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  table td.bold { font-weight: 600; }
  table tr:nth-child(even) td { background: #f9fafb; }
  .secondary { font-size: 10px; color: #777; margin-top: 1px; }
  .badge-index {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    background: #dcfce7;
    color: #15803d;
  }
  tr.totals-row td {
    border-top: 2px solid #16a34a;
    background: #f0fdf4 !important;
    font-weight: 700;
    padding-top: 9px;
    padding-bottom: 9px;
  }
  .empty {
    text-align: center;
    padding: 60px;
    color: #666;
    font-size: 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .notes-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    color: #166534;
    margin-top: 16px;
  }
  .footer {
    margin-top: 25px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 10px;
    color: #999;
  }
  .print-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #16a34a;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 100;
  }
  .print-btn:hover { background: #15803d; }
`;

export default function ReajustesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
