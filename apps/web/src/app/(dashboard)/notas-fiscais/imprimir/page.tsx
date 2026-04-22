"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface NotaFiscal {
  entryId: string;
  owner: { id: string; name: string; cpfCnpj: string };
  contract: { id: string; code: string; rentalValue: number; adminFeePercent: number } | null;
  aluguelBruto: number;
  adminFeePercent: number;
  adminFeeValue: number;
  repasseValue: number;
  nfEmitida: boolean;
  nfNumero: string;
  nfData: string;
}

interface NotasResponse {
  month: string;
  total: number;
  emitidas: number;
  pendentes: number;
  totalAdminFee: number;
  notas: NotaFiscal[];
}

interface OwnerFull {
  id: string;
  name: string;
  cpfCnpj: string;
  personType: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function formatMonthLabel(month: string): string {
  if (!month) return "";
  const [y, m] = month.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]}/${y}`;
}

function formatAddress(o: OwnerFull): string {
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
  const month = searchParams.get("month") || "";
  const entryIdsParam = searchParams.get("entryIds") || "";
  const entryIds = entryIdsParam ? entryIdsParam.split(",").filter(Boolean) : [];

  const [data, setData] = useState<NotasResponse | null>(null);
  const [ownersFull, setOwnersFull] = useState<Record<string, OwnerFull>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!month) {
      setLoading(false);
      return;
    }

    fetch(`/api/notas-fiscais?month=${month}`)
      .then((r) => r.json())
      .then(async (nfData: NotasResponse) => {
        setData(nfData);

        // Filtrar apenas as selecionadas se entryIds foi passado
        const notasToFetch = entryIds.length
          ? nfData.notas.filter((n) => entryIds.includes(n.entryId))
          : nfData.notas;

        // Buscar dados completos dos proprietarios
        const ownerIds = Array.from(new Set(notasToFetch.map((n) => n.owner.id)));
        const ownersData: Record<string, OwnerFull> = {};
        await Promise.all(
          ownerIds.map(async (oid) => {
            try {
              const r = await fetch(`/api/owners/${oid}`);
              if (r.ok) {
                const o = await r.json();
                ownersData[oid] = o;
              }
            } catch {
              // ignore
            }
          })
        );
        setOwnersFull(ownersData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, entryIdsParam]);

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => window.print(), 600);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">Erro ao carregar dados.</p>
      </div>
    );
  }

  // Filtrar notas: se entryIds vazio, imprime todas do mes
  const notas = entryIds.length
    ? data.notas.filter((n) => entryIds.includes(n.entryId))
    : data.notas;

  const totalNfs = notas.length;
  const totalValor = notas.reduce((s, n) => s + n.adminFeeValue, 0);
  const pf = notas.filter((n) => ownersFull[n.owner.id]?.personType !== "PJ");
  const pj = notas.filter((n) => ownersFull[n.owner.id]?.personType === "PJ");
  const totalPf = pf.reduce((s, n) => s + n.adminFeeValue, 0);
  const totalPj = pj.reduce((s, n) => s + n.adminFeeValue, 0);

  const today = new Date().toLocaleString("pt-BR");
  const periodoLabel = formatMonthLabel(month);

  return (
    <div className="nf-page">
      <style>{styles}</style>
      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>

      {/* Header principal */}
      <div className="top-header">
        <div className="empresa-block">
          <div className="empresa-nome">Somma Imoveis Ltda</div>
          <div className="empresa-cnpj">CNPJ: 40.528.068/0001-62</div>
        </div>
        <div className="titulo-block">
          <div className="titulo">Relatorio de Notas Fiscais a Emitir</div>
          <div className="periodo">Competencia: {periodoLabel}</div>
        </div>
        <div className="emissao">Gerado em: {today}</div>
      </div>

      {/* Resumo */}
      <div className="resumo">
        <div className="resumo-card">
          <div className="label">Total de NFs</div>
          <div className="value">{totalNfs}</div>
        </div>
        <div className="resumo-card">
          <div className="label">Pessoa Fisica</div>
          <div className="value">{pf.length}</div>
          <div className="sub">{formatCurrency(totalPf)}</div>
        </div>
        <div className="resumo-card">
          <div className="label">Pessoa Juridica</div>
          <div className="value">{pj.length}</div>
          <div className="sub">{formatCurrency(totalPj)}</div>
        </div>
        <div className="resumo-card total">
          <div className="label">Total em R$</div>
          <div className="value">{formatCurrency(totalValor)}</div>
        </div>
      </div>

      {/* Tabela consolidada */}
      <div className="section">
        <div className="section-title">Relacao de NFs</div>
        <table className="relacao-table">
          <thead>
            <tr>
              <th style={{ width: "30px" }}>#</th>
              <th>Tomador (Proprietario)</th>
              <th>CPF/CNPJ</th>
              <th>Tipo</th>
              <th>Contrato</th>
              <th className="right">Aluguel Bruto</th>
              <th className="right">%</th>
              <th className="right">Valor NF</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((n, i) => {
              const o = ownersFull[n.owner.id];
              return (
                <tr key={n.entryId}>
                  <td>{i + 1}</td>
                  <td>{n.owner.name}</td>
                  <td>{n.owner.cpfCnpj}</td>
                  <td>{o?.personType === "PJ" ? "PJ" : "PF"}</td>
                  <td>{n.contract?.code || "-"}</td>
                  <td className="right">{formatCurrency(n.aluguelBruto)}</td>
                  <td className="right">{n.adminFeePercent}%</td>
                  <td className="right bold">{formatCurrency(n.adminFeeValue)}</td>
                </tr>
              );
            })}
            <tr className="totals-row">
              <td colSpan={7} className="right">
                <strong>TOTAL ({totalNfs} NFs):</strong>
              </td>
              <td className="right bold">{formatCurrency(totalValor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Uma pagina por NF - detalhamento */}
      {notas.map((n, i) => {
        const o = ownersFull[n.owner.id];
        return (
          <div key={`nf-${n.entryId}`} className="nf-detail page-break">
            <div className="nf-header">
              <div>
                <div className="nf-subtitle">Detalhamento NF {i + 1} de {totalNfs}</div>
                <div className="nf-title">Solicitacao de Emissao de Nota Fiscal de Servico</div>
              </div>
              <div className="nf-comp">Ref: {periodoLabel}</div>
            </div>

            <div className="nf-section">
              <div className="nf-section-title">Prestadora de Servico</div>
              <div className="nf-line">
                <strong>Razao Social:</strong> Somma Imoveis Ltda
              </div>
              <div className="nf-line">
                <strong>CNPJ:</strong> 40.528.068/0001-62
              </div>
            </div>

            <div className="nf-section">
              <div className="nf-section-title">Tomador do Servico</div>
              <div className="nf-line">
                <strong>Nome/Razao Social:</strong> {n.owner.name}
              </div>
              <div className="nf-line">
                <strong>{o?.personType === "PJ" ? "CNPJ" : "CPF"}:</strong> {n.owner.cpfCnpj}
              </div>
              {o && (
                <>
                  {o.email && (
                    <div className="nf-line">
                      <strong>E-mail:</strong> {o.email}
                    </div>
                  )}
                  {o.phone && (
                    <div className="nf-line">
                      <strong>Telefone:</strong> {o.phone}
                    </div>
                  )}
                  {formatAddress(o) && (
                    <div className="nf-line">
                      <strong>Endereco:</strong> {formatAddress(o)}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="nf-section">
              <div className="nf-section-title">Descricao do Servico</div>
              <div className="nf-line">
                Taxa de administracao de locacao imobiliaria referente ao mes de{" "}
                <strong>{periodoLabel}</strong>
                {n.contract?.code && (
                  <>
                    {" "}
                    - Contrato <strong>{n.contract.code}</strong>
                  </>
                )}
                .
              </div>
            </div>

            <div className="nf-section">
              <div className="nf-section-title">Valores</div>
              <table className="nf-valores">
                <tbody>
                  <tr>
                    <td>Aluguel Bruto (base de calculo):</td>
                    <td className="right">{formatCurrency(n.aluguelBruto)}</td>
                  </tr>
                  <tr>
                    <td>Percentual da Taxa de Administracao:</td>
                    <td className="right">{n.adminFeePercent}%</td>
                  </tr>
                  <tr className="total">
                    <td>
                      <strong>Valor Total da NF:</strong>
                    </td>
                    <td className="right bold">{formatCurrency(n.adminFeeValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="nf-footer">
              <div className="nf-sign">
                _______________________________________
                <br />
                Somma Imoveis Ltda
              </div>
            </div>
          </div>
        );
      })}

      <div className="footer">
        <p>Somma Imoveis - Relatorio de Notas Fiscais</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

const styles = `
  @media print {
    body { margin: 0; padding: 0; }
    .no-print { display: none !important; }
    .nf-page { padding: 12mm; }
    .page-break { page-break-before: always; }
    @page { size: A4 portrait; margin: 0; }
  }
  @media screen {
    .nf-page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm;
      background: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      margin-top: 10px;
      margin-bottom: 20px;
    }
    body { background: #f5f5f5; }
  }
  .nf-page {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 11px;
    line-height: 1.4;
  }
  .top-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  .empresa-block {
    font-size: 11px;
  }
  .empresa-nome { font-weight: 700; font-size: 13px; }
  .empresa-cnpj { font-size: 10px; margin-top: 2px; }
  .titulo-block { text-align: center; flex: 1; }
  .titulo { font-size: 15px; font-weight: 700; }
  .periodo { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .emissao { font-size: 9px; text-align: right; color: #555; }
  .resumo {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  .resumo-card {
    border: 1px solid #000;
    padding: 8px 12px;
    text-align: center;
  }
  .resumo-card.total { background: #f0f0f0; }
  .resumo-card .label {
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #555;
  }
  .resumo-card .value {
    font-size: 18px;
    font-weight: 700;
    margin-top: 2px;
  }
  .resumo-card .sub {
    font-size: 10px;
    color: #555;
    margin-top: 2px;
  }
  .section { margin-bottom: 20px; }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 6px;
    padding-bottom: 2px;
    border-bottom: 1px solid #000;
  }
  .relacao-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    font-size: 10px;
  }
  .relacao-table th {
    background: #f0f0f0;
    border: 1px solid #000;
    padding: 4px 6px;
    text-align: left;
    font-weight: 700;
  }
  .relacao-table th.right { text-align: right; }
  .relacao-table td {
    border: 1px solid #ccc;
    padding: 3px 6px;
  }
  .relacao-table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .relacao-table td.bold { font-weight: 700; }
  tr.totals-row td {
    background: #f0f0f0;
    border-top: 2px solid #000;
    font-weight: 700;
  }
  .nf-detail {
    padding-top: 10mm;
  }
  .nf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  .nf-subtitle {
    font-size: 10px;
    text-transform: uppercase;
    color: #555;
  }
  .nf-title {
    font-size: 14px;
    font-weight: 700;
    margin-top: 2px;
  }
  .nf-comp {
    font-size: 12px;
    font-weight: 700;
  }
  .nf-section {
    margin-bottom: 14px;
    border: 1px solid #000;
    padding: 8px 12px;
  }
  .nf-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: #f0f0f0;
    padding: 3px 8px;
    margin: -8px -12px 8px -12px;
    border-bottom: 1px solid #000;
  }
  .nf-line {
    font-size: 11px;
    margin-bottom: 3px;
  }
  .nf-valores {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .nf-valores td {
    padding: 4px 0;
    border-bottom: 1px dotted #ccc;
  }
  .nf-valores td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .nf-valores td.bold { font-weight: 700; }
  .nf-valores tr.total td {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    background: #f0f0f0;
    padding: 6px 6px;
    font-size: 13px;
  }
  .nf-footer {
    margin-top: 40px;
    text-align: center;
    font-size: 10px;
  }
  .nf-sign {
    display: inline-block;
    padding-top: 20px;
  }
  .footer {
    margin-top: 30px;
    padding-top: 8px;
    border-top: 1px solid #ccc;
    text-align: center;
    font-size: 9px;
    color: #777;
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

export default function ImprimirNotasPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
