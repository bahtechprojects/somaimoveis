"use client";

import { useEffect, useState } from "react";

interface Pagamento {
  id: string;
  code: string;
  dueDate: string;
  value: number;
  paidValue: number;
  openValue: number;
  status: string;
  diasAtraso: number;
  contractCode: string;
  propertyTitle: string;
  ownerName: string;
}

interface Inadimplente {
  tenant: {
    id: string;
    name: string;
    cpfCnpj: string;
    phone: string | null;
    email: string | null;
  } | null;
  totalDue: number;
  totalPaid: number;
  totalOpen: number;
  oldestDueDate: string | null;
  maxDiasAtraso: number;
  pagamentos: Pagamento[];
}

interface Data {
  dataReferencia: string;
  totais: {
    totalLocatarios: number;
    totalPagamentos: number;
    totalDue: number;
    totalPaid: number;
    totalOpen: number;
  };
  inadimplentes: Inadimplente[];
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

function faixaAtraso(dias: number): { label: string; color: string } {
  if (dias <= 15) return { label: "1-15 dias", color: "#eab308" };
  if (dias <= 30) return { label: "16-30 dias", color: "#f97316" };
  if (dias <= 60) return { label: "31-60 dias", color: "#dc2626" };
  if (dias <= 90) return { label: "61-90 dias", color: "#991b1b" };
  return { label: "90+ dias", color: "#7f1d1d" };
}

export default function InadimplenciaPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/relatorios/inadimplencia")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
      <style>{commonStyles}</style>
      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>

      <div className="header-bar header-danger">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Relatorio de Inadimplencia</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Referencia: {formatDate(data.dataReferencia)}</div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-card">
          <div className="label">Locatarios em Atraso</div>
          <div className="value">{data.totais.totalLocatarios}</div>
        </div>
        <div className="summary-card">
          <div className="label">Pagamentos Vencidos</div>
          <div className="value">{data.totais.totalPagamentos}</div>
        </div>
        <div className="summary-card danger">
          <div className="label">Total em Aberto</div>
          <div className="value">{formatCurrency(data.totais.totalOpen)}</div>
        </div>
      </div>

      {data.inadimplentes.length === 0 ? (
        <div className="empty">
          <p>Nenhum locatario em atraso. Tudo em dia!</p>
        </div>
      ) : (
        data.inadimplentes.map((inad, idx) => {
          const faixa = faixaAtraso(inad.maxDiasAtraso);
          return (
            <div key={inad.tenant?.id || idx} className="inadimplente-card">
              <div className="inad-header">
                <div>
                  <div className="tenant-name">{inad.tenant?.name || "Sem locatario"}</div>
                  <div className="tenant-info">
                    {inad.tenant?.cpfCnpj && <span>{inad.tenant.cpfCnpj}</span>}
                    {inad.tenant?.phone && <span> | {inad.tenant.phone}</span>}
                    {inad.tenant?.email && <span> | {inad.tenant.email}</span>}
                  </div>
                </div>
                <div className="inad-totals">
                  <div className="inad-value">{formatCurrency(inad.totalOpen)}</div>
                  <div className="inad-sub">
                    Desde {formatDate(inad.oldestDueDate)} | max{" "}
                    <span style={{ color: faixa.color, fontWeight: 600 }}>
                      {inad.maxDiasAtraso} dias ({faixa.label})
                    </span>
                  </div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Cobranca</th>
                    <th>Contrato</th>
                    <th>Imovel</th>
                    <th>Proprietario</th>
                    <th>Vencimento</th>
                    <th className="right">Atraso</th>
                    <th className="right">Valor</th>
                    <th className="right">Pago</th>
                    <th className="right">Em Aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {inad.pagamentos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td>{p.contractCode}</td>
                      <td>{p.propertyTitle}</td>
                      <td>{p.ownerName}</td>
                      <td>{formatDate(p.dueDate)}</td>
                      <td className="right" style={{ color: faixaAtraso(p.diasAtraso).color, fontWeight: 600 }}>
                        {p.diasAtraso} dias
                      </td>
                      <td className="right">{formatCurrency(p.value)}</td>
                      <td className="right">{formatCurrency(p.paidValue)}</td>
                      <td className="right bold danger-text">{formatCurrency(p.openValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {data.inadimplentes.length > 0 && (
        <div className="total-bar">
          <div>
            TOTAL GERAL ({data.totais.totalLocatarios} locatarios | {data.totais.totalPagamentos} cobrancas)
          </div>
          <div>{formatCurrency(data.totais.totalOpen)}</div>
        </div>
      )}

      <div className="footer">
        <p>Somma Imoveis - Relatorio de Inadimplencia</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

const commonStyles = `
  @media print {
    body { margin: 0; padding: 0; }
    .no-print { display: none !important; }
    .relatorio-page { padding: 15px; }
    .inadimplente-card { page-break-inside: avoid; }
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
    border-bottom: 3px solid #dc2626;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .header-bar h1 {
    font-size: 22px;
    font-weight: 700;
    color: #dc2626;
    margin: 0;
  }
  .header-bar .subtitle {
    font-size: 13px;
    color: #666;
    margin: 2px 0 0;
  }
  .header-right { text-align: right; font-size: 11px; color: #888; }
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .summary-card {
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px 14px;
  }
  .summary-card.danger {
    background: #fef2f2;
    border-color: #fecaca;
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
    color: #dc2626;
  }
  .inadimplente-card {
    border: 1px solid #fecaca;
    border-left: 4px solid #dc2626;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 14px;
    background: #fff;
  }
  .inad-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f3f4f6;
  }
  .tenant-name {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .tenant-info {
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }
  .inad-totals { text-align: right; }
  .inad-value {
    font-size: 18px;
    font-weight: 700;
    color: #dc2626;
  }
  .inad-sub { font-size: 10px; color: #666; margin-top: 2px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table th {
    background: #f3f4f6;
    color: #374151;
    padding: 6px 8px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table th.right { text-align: right; }
  table td {
    border-bottom: 1px solid #f3f4f6;
    padding: 5px 8px;
  }
  table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  table td.bold { font-weight: 600; }
  table td.danger-text { color: #dc2626; }
  .total-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #dc2626;
    color: white;
    padding: 12px 18px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 700;
    margin-top: 8px;
  }
  .empty {
    text-align: center;
    padding: 60px;
    color: #16a34a;
    font-size: 16px;
    font-weight: 600;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
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
    background: #dc2626;
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
  .print-btn:hover { background: #b91c1c; }
`;
