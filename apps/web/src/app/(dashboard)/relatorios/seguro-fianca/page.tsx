"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ContratoSeguro {
  contractId: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentalValue: number;
  insuranceFee: number;
  guaranteeValue: number | null;
  guaranteeNotes: string | null;
  property: { id: string; title: string; address: string } | null;
  owner: { id: string; name: string; cpfCnpj: string } | null;
  tenant: {
    id: string;
    name: string;
    cpfCnpj: string;
    phone: string | null;
    email: string | null;
  } | null;
  foiCobrado: boolean;
  valorCobrado: number;
  paymentCode: string | null;
  paymentStatus: string | null;
  paymentDueDate: string | null;
  paymentPaidAt: string | null;
  hasAnyPayment: boolean;
}

interface Data {
  month: string;
  totais: {
    total: number;
    ativos: number;
    cobrados: number;
    naoCobrados: number;
    semSeguroDefinido: number;
    totalSeguroCadastrado: number;
    totalCobrado: number;
  };
  contratos: ContratoSeguro[];
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(s: string | null): string {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("pt-BR", {
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
    fetch(`/api/relatorios/seguro-fianca?month=${month}`)
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
          <p className="subtitle">Contratos com Seguro Fianca - {data.month}</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Competencia: {data.month}</div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-card">
          <div className="label">Contratos c/ Seguro</div>
          <div className="value">{data.totais.total}</div>
        </div>
        <div className="summary-card">
          <div className="label">Ativos</div>
          <div className="value">{data.totais.ativos}</div>
        </div>
        <div className="summary-card success">
          <div className="label">Cobrados no mes</div>
          <div className="value">{data.totais.cobrados}</div>
          <div className="sub">{formatCurrency(data.totais.totalCobrado)}</div>
        </div>
        <div className="summary-card danger">
          <div className="label">NAO cobrados</div>
          <div className="value">{data.totais.naoCobrados}</div>
        </div>
      </div>

      {data.contratos.length === 0 ? (
        <div className="empty">
          <p>Nenhum contrato com garantia de Seguro Fianca cadastrado.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Imovel</th>
              <th>Locatario</th>
              <th>Proprietario</th>
              <th>Inicio</th>
              <th>Termino</th>
              <th className="right">Aluguel</th>
              <th className="right">Seguro/mes</th>
              <th>Cobrado?</th>
            </tr>
          </thead>
          <tbody>
            {data.contratos.map((c) => {
              const isActive = c.status === "ATIVO";
              const semSeguro = c.insuranceFee === 0;
              return (
                <tr key={c.contractId} className={!isActive ? "inactive" : ""}>
                  <td className="bold">{c.code}</td>
                  <td>
                    {c.property?.title || "-"}
                    {c.property?.address && (
                      <div className="secondary">{c.property.address}</div>
                    )}
                  </td>
                  <td>
                    {c.tenant?.name || "-"}
                    {c.tenant?.cpfCnpj && (
                      <div className="secondary">{c.tenant.cpfCnpj}</div>
                    )}
                  </td>
                  <td>{c.owner?.name || "-"}</td>
                  <td>{formatDate(c.startDate)}</td>
                  <td>{formatDate(c.endDate)}</td>
                  <td className="right">{formatCurrency(c.rentalValue)}</td>
                  <td className="right">
                    {semSeguro ? (
                      <span className="badge badge-warn">NAO DEFINIDO</span>
                    ) : (
                      <span className="bold">{formatCurrency(c.insuranceFee)}</span>
                    )}
                  </td>
                  <td>
                    {semSeguro ? (
                      <span className="badge badge-warn">-</span>
                    ) : !isActive ? (
                      <span className="badge badge-muted">{c.status}</span>
                    ) : c.foiCobrado ? (
                      <div>
                        <span className="badge badge-ok">SIM</span>
                        {c.paymentCode && (
                          <div className="secondary mt-1">
                            {c.paymentCode}
                            {c.paymentStatus && (
                              <span className={`status-dot status-${c.paymentStatus.toLowerCase()}`}>
                                {" "}
                                {c.paymentStatus}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-danger">NAO</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="totals-row">
              <td colSpan={7} style={{ textAlign: "right" }}>
                TOTAL SEGURO/MES (cadastrado):
              </td>
              <td className="right bold">
                {formatCurrency(data.totais.totalSeguroCadastrado)}
              </td>
              <td className="right bold">
                {formatCurrency(data.totais.totalCobrado)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="notes-box">
        <strong>Como o seguro foi detectado:</strong>
        <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
          <li>Pagamentos do mes cuja descricao/notes mencionam &quot;seguro&quot;</li>
          <li>Pagamentos com valor = aluguel + seguroFianca do contrato</li>
          <li>Breakdown estruturado (notes JSON) com campo seguroFianca</li>
        </ul>
        <p style={{ margin: "6px 0 0 0" }}>
          <strong>NAO cobrados:</strong> contratos ativos com seguro cadastrado no cadastro
          mas sem registro de cobranca nesse mes. Verificar antes de gerar novas cobrancas.
        </p>
      </div>

      <div className="footer">
        <p>Somma Imoveis - Relatorio de Seguro Fianca</p>
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
      max-width: 1200px;
      margin: 0 auto;
      padding: 30px;
    }
  }
  .relatorio-page {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1a1a1a;
    font-size: 11px;
    line-height: 1.4;
  }
  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #7c3aed;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .header-bar h1 {
    font-size: 22px;
    font-weight: 700;
    color: #7c3aed;
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
  .summary-card.success { background: #f0fdf4; border-color: #bbf7d0; }
  .summary-card.success .value { color: #16a34a; }
  .summary-card.danger { background: #fef2f2; border-color: #fecaca; }
  .summary-card.danger .value { color: #dc2626; }
  .summary-card .label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .summary-card .value {
    font-size: 22px;
    font-weight: 700;
    margin-top: 2px;
  }
  .summary-card .sub {
    font-size: 10px;
    color: #555;
    margin-top: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }
  table th {
    background: #7c3aed;
    color: white;
    padding: 6px 8px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table th.right { text-align: right; }
  table td {
    border-bottom: 1px solid #e5e7eb;
    padding: 5px 8px;
    vertical-align: top;
  }
  table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  table td.bold { font-weight: 600; }
  table tr:nth-child(even) td { background: #faf9fb; }
  table tr.inactive td { opacity: 0.55; }
  .secondary { font-size: 9px; color: #777; margin-top: 1px; }
  .mt-1 { margin-top: 2px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge-ok { background: #dcfce7; color: #15803d; }
  .badge-danger { background: #fee2e2; color: #991b1b; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-muted { background: #f3f4f6; color: #6b7280; }
  .status-dot { font-size: 9px; font-weight: 600; }
  .status-pago { color: #16a34a; }
  .status-pendente { color: #d97706; }
  .status-atrasado { color: #dc2626; }
  tr.totals-row td {
    background: #ede9fe !important;
    border-top: 2px solid #7c3aed;
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
    background: #faf5ff;
    border: 1px solid #e9d5ff;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    color: #581c87;
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
    background: #7c3aed;
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
  .print-btn:hover { background: #6d28d9; }
`;

export default function SeguroFiancaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
