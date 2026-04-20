"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Contrato {
  contractId: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string;
  diasRestantes: number;
  urgencia: "ALTA" | "MEDIA" | "BAIXA";
  rentalValue: number;
  property: { id: string; title: string; address: string } | null;
  owner: { id: string; name: string; cpfCnpj: string; phone: string | null } | null;
  tenant: { id: string; name: string; cpfCnpj: string; phone: string | null; email: string | null } | null;
}

interface Data {
  dataReferencia: string;
  periodoDias: number;
  totais: {
    total: number;
    alta: number;
    media: number;
    baixa: number;
    totalAluguel: number;
  };
  contratos: Contrato[];
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

const urgenciaColors: Record<string, { bg: string; fg: string; label: string }> = {
  ALTA: { bg: "#fee2e2", fg: "#991b1b", label: "URGENTE" },
  MEDIA: { bg: "#fef3c7", fg: "#92400e", label: "ATENCAO" },
  BAIXA: { bg: "#dbeafe", fg: "#1e40af", label: "NORMAL" },
};

function RelatorioContent() {
  const searchParams = useSearchParams();
  const days = searchParams.get("days") || "90";

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/relatorios/contratos-vencendo?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

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
          <p className="subtitle">Contratos Vencendo - Proximos {data.periodoDias} dias</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Referencia: {formatDate(data.dataReferencia)}</div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-card">
          <div className="label">Total de Contratos</div>
          <div className="value">{data.totais.total}</div>
        </div>
        <div className="summary-card urgent">
          <div className="label">Urgente (ate 30d)</div>
          <div className="value">{data.totais.alta}</div>
        </div>
        <div className="summary-card attention">
          <div className="label">Atencao (31-60d)</div>
          <div className="value">{data.totais.media}</div>
        </div>
        <div className="summary-card normal">
          <div className="label">Normal (61-90d)</div>
          <div className="value">{data.totais.baixa}</div>
        </div>
      </div>

      {data.contratos.length === 0 ? (
        <div className="empty">
          <p>Nenhum contrato vencendo nos proximos {data.periodoDias} dias.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Urgencia</th>
              <th>Contrato</th>
              <th>Imovel</th>
              <th>Proprietario</th>
              <th>Locatario</th>
              <th>Inicio</th>
              <th>Termino</th>
              <th className="right">Dias</th>
              <th className="right">Aluguel</th>
            </tr>
          </thead>
          <tbody>
            {data.contratos.map((c) => {
              const u = urgenciaColors[c.urgencia];
              return (
                <tr key={c.contractId}>
                  <td>
                    <span className="badge" style={{ background: u.bg, color: u.fg }}>
                      {u.label}
                    </span>
                  </td>
                  <td className="bold">{c.code}</td>
                  <td>
                    {c.property?.title || "-"}
                    {c.property?.address && <div className="secondary">{c.property.address}</div>}
                  </td>
                  <td>
                    {c.owner?.name || "-"}
                    {c.owner?.phone && <div className="secondary">{c.owner.phone}</div>}
                  </td>
                  <td>
                    {c.tenant?.name || "-"}
                    {c.tenant?.phone && <div className="secondary">{c.tenant.phone}</div>}
                  </td>
                  <td>{formatDate(c.startDate)}</td>
                  <td className="bold">{formatDate(c.endDate)}</td>
                  <td className="right" style={{ color: u.fg, fontWeight: 700 }}>
                    {c.diasRestantes}
                  </td>
                  <td className="right">{formatCurrency(c.rentalValue)}</td>
                </tr>
              );
            })}
            <tr className="totals-row">
              <td colSpan={8} style={{ textAlign: "right" }}>
                TOTAL ALUGUEL MENSAL:
              </td>
              <td className="right">{formatCurrency(data.totais.totalAluguel)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="notes-box">
        <strong>Acoes recomendadas:</strong>
        <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
          <li><strong>URGENTE</strong> (ate 30d): entrar em contato imediatamente para renovacao ou aviso de saida.</li>
          <li><strong>ATENCAO</strong> (31-60d): agendar reuniao para definir renovacao e reajuste.</li>
          <li><strong>NORMAL</strong> (61-90d): acompanhar e iniciar tratativas preliminares.</li>
        </ul>
      </div>

      <div className="footer">
        <p>Somma Imoveis - Contratos Vencendo</p>
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
    border-bottom: 3px solid #d97706;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .header-bar h1 {
    font-size: 22px;
    font-weight: 700;
    color: #d97706;
    margin: 0;
  }
  .header-bar .subtitle { font-size: 13px; color: #666; margin: 2px 0 0; }
  .header-right { text-align: right; font-size: 11px; color: #888; }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
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
    font-size: 20px;
    font-weight: 700;
    margin-top: 2px;
  }
  .summary-card.urgent { background: #fef2f2; border-color: #fecaca; }
  .summary-card.urgent .value { color: #dc2626; }
  .summary-card.attention { background: #fffbeb; border-color: #fde68a; }
  .summary-card.attention .value { color: #d97706; }
  .summary-card.normal { background: #eff6ff; border-color: #bfdbfe; }
  .summary-card.normal .value { color: #2563eb; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table th {
    background: #d97706;
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
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  tr.totals-row td {
    border-top: 2px solid #d97706;
    background: #fffbeb !important;
    font-weight: 700;
    padding-top: 9px;
    padding-bottom: 9px;
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
  .notes-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    color: #92400e;
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
    background: #d97706;
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
  .print-btn:hover { background: #b45309; }
`;

export default function ContratosVencendoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
