"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Locacao {
  contractId: string;
  code: string;
  status: string;
  type: string;
  startDate: string;
  endDate: string | null;
  rentalValue: number;
  adminFeePercent: number | null;
  property: { id: string; title: string; type: string; address: string } | null;
  owner: { id: string; name: string; cpfCnpj: string } | null;
  tenant: { id: string; name: string; cpfCnpj: string } | null;
}

interface RelatorioData {
  month: string;
  total: number;
  totalAluguel: number;
  totalAdminFee: number;
  locacoes: Locacao[];
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

const propertyTypeLabels: Record<string, string> = {
  CASA: "Casa",
  APARTAMENTO: "Apto",
  COMERCIAL: "Comercial",
  TERRENO: "Terreno",
  SALA: "Sala",
  PAVILHAO: "Pavilhao",
};

function RelatorioContent() {
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = monthParam || defaultMonth;

  const [data, setData] = useState<RelatorioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/relatorios/locacoes-mes?month=${month}`)
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
        <p className="text-lg text-red-500">Erro ao carregar relatorio.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="relatorio-page">
      <style>{`
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
          border-bottom: 3px solid #2563eb;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .header-bar h1 {
          font-size: 22px;
          font-weight: 700;
          color: #2563eb;
          margin: 0;
        }
        .header-bar .subtitle {
          font-size: 13px;
          color: #666;
          margin: 2px 0 0;
        }
        .header-right {
          text-align: right;
          font-size: 11px;
          color: #888;
        }
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
        .summary-card .label {
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .summary-card .value {
          font-size: 18px;
          font-weight: 700;
          margin-top: 2px;
          color: #2563eb;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        table th {
          background: #2563eb;
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
        table tr:nth-child(even) td { background: #f9fafb; }
        .code-col { font-weight: 600; white-space: nowrap; }
        .secondary { font-size: 10px; color: #777; }
        .badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 10px;
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .badge-ativo { background: #dcfce7; color: #16a34a; }
        .badge-encerrado { background: #f3f4f6; color: #6b7280; }
        .badge-cancelado { background: #fee2e2; color: #dc2626; }
        .badge-pendente_renovacao { background: #fef3c7; color: #d97706; }
        .totals-row td {
          border-top: 2px solid #2563eb;
          background: #eff6ff !important;
          font-weight: 700;
          padding-top: 8px;
          padding-bottom: 8px;
        }
        .empty {
          text-align: center;
          padding: 40px;
          color: #888;
          font-style: italic;
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
          background: #2563eb;
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
        .print-btn:hover { background: #1d4ed8; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>

      <div className="header-bar">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Relatorio de Locacoes - {data.month}</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Competencia: {data.month}</div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-card">
          <div className="label">Imoveis Alugados</div>
          <div className="value">{data.total}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Aluguel</div>
          <div className="value">{formatCurrency(data.totalAluguel)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Taxa Adm (Prev.)</div>
          <div className="value">{formatCurrency(data.totalAdminFee)}</div>
        </div>
      </div>

      {data.locacoes.length === 0 ? (
        <div className="empty">
          <p>Nenhuma locacao iniciada no mes {data.month}.</p>
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
              <th>Termino</th>
              <th>Status</th>
              <th className="right">Aluguel</th>
              <th className="right">Tx. Adm</th>
            </tr>
          </thead>
          <tbody>
            {data.locacoes.map((l) => (
              <tr key={l.contractId}>
                <td className="code-col">{l.code}</td>
                <td>
                  {l.property?.title || "-"}
                  {l.property?.type && (
                    <div className="secondary">{propertyTypeLabels[l.property.type] || l.property.type}</div>
                  )}
                  {l.property?.address && <div className="secondary">{l.property.address}</div>}
                </td>
                <td>
                  {l.owner?.name || "-"}
                  {l.owner?.cpfCnpj && <div className="secondary">{l.owner.cpfCnpj}</div>}
                </td>
                <td>
                  {l.tenant?.name || "-"}
                  {l.tenant?.cpfCnpj && <div className="secondary">{l.tenant.cpfCnpj}</div>}
                </td>
                <td>{formatDate(l.startDate)}</td>
                <td>{formatDate(l.endDate)}</td>
                <td>
                  <span className={`badge badge-${l.status.toLowerCase()}`}>{l.status}</span>
                </td>
                <td className="right">{formatCurrency(l.rentalValue)}</td>
                <td className="right">
                  {l.adminFeePercent != null ? `${l.adminFeePercent}%` : "-"}
                </td>
              </tr>
            ))}
            <tr className="totals-row">
              <td colSpan={7} style={{ textAlign: "right" }}>
                TOTAIS ({data.total} {data.total === 1 ? "locacao" : "locacoes"}):
              </td>
              <td className="right">{formatCurrency(data.totalAluguel)}</td>
              <td className="right">{formatCurrency(data.totalAdminFee)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="footer">
        <p>Somma Imoveis - Relatorio de Locacoes do Mes</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

export default function LocacoesMesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
