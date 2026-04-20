"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface OwnerData {
  id: string;
  name: string;
  cpfCnpj: string;
  personType: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

interface MonthRow {
  month: number;
  aluguelBruto: number;
  adminFee: number;
  irrf: number;
  liquido: number;
  lancamentos: number;
}

interface ExtratoData {
  year: number;
  owner: OwnerData;
  meses: MonthRow[];
  totais: {
    aluguelBruto: number;
    adminFee: number;
    irrf: number;
    liquido: number;
    lancamentos: number;
  };
  detalhes: Array<{
    date: string;
    month: number;
    contractCode: string;
    propertyTitle: string;
    tenantName: string;
    aluguelBruto: number;
    adminFee: number;
    irrf: number;
    liquido: number;
  }>;
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatAddress(o: OwnerData): string {
  const parts = [];
  if (o.street) {
    let line = o.street;
    if (o.number) line += `, ${o.number}`;
    if (o.complement) line += ` - ${o.complement}`;
    parts.push(line);
  }
  if (o.neighborhood) parts.push(o.neighborhood);
  if (o.city && o.state) parts.push(`${o.city}/${o.state}`);
  if (o.zipCode) parts.push(`CEP: ${o.zipCode}`);
  return parts.join(" | ");
}

function RelatorioContent() {
  const searchParams = useSearchParams();
  const ownerId = searchParams.get("ownerId");
  const year = searchParams.get("year") || String(new Date().getFullYear());

  const [data, setData] = useState<ExtratoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    fetch(`/api/relatorios/extrato-proprietario?ownerId=${ownerId}&year=${year}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ownerId, year]);

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Carregando extrato...</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">Proprietario nao encontrado.</p>
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

      <div className="header-bar">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Extrato Anual do Proprietario - {data.year}</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <div>Ano-base: {data.year}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Proprietario</div>
        <div className="info-grid">
          <div>
            <span className="label">Nome: </span>
            <span className="value">{data.owner.name}</span>
          </div>
          <div>
            <span className="label">CPF/CNPJ: </span>
            <span className="value">{data.owner.cpfCnpj}</span>
          </div>
          <div>
            <span className="label">Tipo: </span>
            <span className="value">
              {data.owner.personType === "PF" ? "Pessoa Fisica" : "Pessoa Juridica"}
            </span>
          </div>
          {formatAddress(data.owner) && (
            <div className="full-width">
              <span className="label">Endereco: </span>
              <span className="value">{formatAddress(data.owner)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Resumo Mensal</div>
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th className="right">Lanc.</th>
              <th className="right">Aluguel Bruto</th>
              <th className="right">Taxa Adm</th>
              <th className="right">IRRF Retido</th>
              <th className="right">Liquido Recebido</th>
            </tr>
          </thead>
          <tbody>
            {data.meses.map((m) => (
              <tr key={m.month} className={m.lancamentos === 0 ? "empty-row" : ""}>
                <td>{MONTHS[m.month]}</td>
                <td className="right">{m.lancamentos || "-"}</td>
                <td className="right">{m.aluguelBruto ? formatCurrency(m.aluguelBruto) : "-"}</td>
                <td className="right">{m.adminFee ? formatCurrency(m.adminFee) : "-"}</td>
                <td className="right">{m.irrf ? formatCurrency(m.irrf) : "-"}</td>
                <td className="right bold">
                  {m.liquido ? formatCurrency(m.liquido) : "-"}
                </td>
              </tr>
            ))}
            <tr className="totals-row">
              <td>TOTAL {data.year}</td>
              <td className="right">{data.totais.lancamentos}</td>
              <td className="right">{formatCurrency(data.totais.aluguelBruto)}</td>
              <td className="right">{formatCurrency(data.totais.adminFee)}</td>
              <td className="right">{formatCurrency(data.totais.irrf)}</td>
              <td className="right">{formatCurrency(data.totais.liquido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.detalhes.length > 0 && (
        <div className="section page-break-before">
          <div className="section-title">Detalhamento por Lancamento</div>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Contrato</th>
                <th>Imovel</th>
                <th>Locatario</th>
                <th className="right">Bruto</th>
                <th className="right">Tx. Adm</th>
                <th className="right">IRRF</th>
                <th className="right">Liquido</th>
              </tr>
            </thead>
            <tbody>
              {data.detalhes.map((d, i) => (
                <tr key={i}>
                  <td>{MONTHS[d.month].slice(0, 3)}</td>
                  <td>{d.contractCode}</td>
                  <td>{d.propertyTitle}</td>
                  <td>{d.tenantName}</td>
                  <td className="right">{formatCurrency(d.aluguelBruto)}</td>
                  <td className="right">{formatCurrency(d.adminFee)}</td>
                  <td className="right">{formatCurrency(d.irrf)}</td>
                  <td className="right bold">{formatCurrency(d.liquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="notes-box">
        <strong>Informacoes para Declaracao de IR:</strong>
        <p style={{ margin: "4px 0 0" }}>
          Os valores informados sao referentes aos repasses efetivamente pagos no ano-base{" "}
          <strong>{data.year}</strong>. O IRRF retido foi recolhido pela fonte pagadora
          (locatario/imobiliaria). Este documento nao substitui o Informe de Rendimentos oficial.
        </p>
      </div>

      <div className="footer">
        <p>Somma Imoveis - Extrato Anual do Proprietario</p>
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
    .page-break-before { page-break-before: always; }
    @page { size: A4 portrait; margin: 12mm; }
  }
  @media screen {
    .relatorio-page {
      max-width: 900px;
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
  .section { margin-bottom: 20px; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #2563eb;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
    font-size: 12px;
  }
  .info-grid .label {
    color: #888;
    font-size: 11px;
  }
  .info-grid .value { font-weight: 500; }
  .info-grid .full-width { grid-column: 1 / -1; }
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
  table td.bold { font-weight: 600; }
  table tr:nth-child(even) td { background: #f9fafb; }
  table tr.empty-row td { color: #bbb; }
  table tr.totals-row td {
    border-top: 2px solid #2563eb;
    background: #eff6ff !important;
    font-weight: 700;
    padding-top: 9px;
    padding-bottom: 9px;
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
`;

export default function ExtratoProprietarioPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
