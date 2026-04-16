"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface EntryData {
  id: string;
  type: string;
  category: string;
  description: string;
  value: number;
  dueDate: string | null;
  status: string;
  notes: string | null;
}

interface OwnerGroup {
  owner: {
    id: string;
    name: string;
    cpfCnpj: string;
    email: string | null;
    phone: string | null;
    bankName: string | null;
    bankAgency: string | null;
    bankAccount: string | null;
    bankPix: string | null;
    bankPixType: string | null;
    thirdPartyName: string | null;
    thirdPartyDocument: string | null;
    thirdPartyBank: string | null;
    thirdPartyAgency: string | null;
    thirdPartyAccount: string | null;
    thirdPartyPixKeyType: string | null;
    thirdPartyPix: string | null;
  };
  entries: EntryData[];
  debitEntries?: EntryData[];
  totalPendente: number;
  totalPago: number;
  totalDebitos?: number;
  totalLiquido?: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]} de ${y}`;
}

function DemonstrativoContent() {
  const searchParams = useSearchParams();
  const ownerId = searchParams.get("ownerId");
  const month = searchParams.get("month") || "";
  const [group, setGroup] = useState<OwnerGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId || !month) return;
    const params = new URLSearchParams({ month, status: "all" });
    fetch(`/api/repasses?${params}`)
      .then((r) => r.json())
      .then((data: OwnerGroup[]) => {
        const found = data.find((g) => g.owner.id === ownerId);
        setGroup(found || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ownerId, month]);

  useEffect(() => {
    if (!loading && group) {
      // Auto-trigger print after render
      setTimeout(() => window.print(), 500);
    }
  }, [loading, group]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Carregando demonstrativo...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">Proprietario nao encontrado para o periodo selecionado.</p>
      </div>
    );
  }

  const o = group.owner;
  const useThirdParty = !!o.thirdPartyName;
  const recipientName = useThirdParty ? o.thirdPartyName : o.name;
  const recipientDoc = useThirdParty ? o.thirdPartyDocument : o.cpfCnpj;
  const bankName = useThirdParty ? o.thirdPartyBank : o.bankName;
  const bankAg = useThirdParty ? o.thirdPartyAgency : o.bankAgency;
  const bankCc = useThirdParty ? o.thirdPartyAccount : o.bankAccount;
  const pixKey = useThirdParty ? o.thirdPartyPix : o.bankPix;
  const pixType = useThirdParty ? o.thirdPartyPixKeyType : o.bankPixType;

  // Parse notes from repasse entries for admin fee info
  let aluguelBruto = 0;
  let adminFeePercent = 0;
  let adminFeeValue = 0;
  let intermediacao = 0;
  let irrfValue = 0;
  for (const e of group.entries) {
    if (!["REPASSE", "GARANTIA"].includes(e.category) || !e.notes) continue;
    try {
      const n = JSON.parse(e.notes);
      if (n.aluguelBruto) aluguelBruto += n.aluguelBruto;
      if (n.adminFeePercent) adminFeePercent = n.adminFeePercent;
      if (n.adminFeeValue) adminFeeValue += n.adminFeeValue;
      if (n.intermediacao) intermediacao += n.intermediacao;
      if (n.irrfValue) irrfValue += n.irrfValue;
    } catch {}
  }

  const creditEntries = group.entries.filter((e) => e.status !== "CANCELADO");
  const debitEntries = (group.debitEntries || []).filter((e) => e.status !== "CANCELADO");
  const totalCreditos = creditEntries.reduce((s, e) => s + e.value, 0);
  const totalDebitos = debitEntries.reduce((s, e) => s + e.value, 0);
  const totalLiquido = totalCreditos - totalDebitos;

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="demonstrativo-page">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .demonstrativo-page { padding: 20px; }
        }
        @media screen {
          .demonstrativo-page {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 30px;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          }
        }
        .demonstrativo-page {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #1a1a1a;
          font-size: 13px;
          line-height: 1.5;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px solid #16a34a;
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        .header-bar h1 {
          font-size: 22px;
          font-weight: 700;
          color: #16a34a;
          margin: 0;
        }
        .header-bar .subtitle {
          font-size: 14px;
          color: #666;
          margin: 2px 0 0;
        }
        .header-right {
          text-align: right;
          font-size: 12px;
          color: #888;
        }
        .section {
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #16a34a;
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
        .info-grid .value {
          font-weight: 500;
        }
        table.entries {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        table.entries th {
          background: #f8f9fa;
          border: 1px solid #e5e7eb;
          padding: 6px 10px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          color: #555;
        }
        table.entries th.right { text-align: right; }
        table.entries td {
          border: 1px solid #e5e7eb;
          padding: 5px 10px;
        }
        table.entries td.right { text-align: right; font-variant-numeric: tabular-nums; }
        table.entries td.bold { font-weight: 600; }
        table.entries tr.debit td { color: #dc2626; }
        table.entries tr.total td {
          font-weight: 700;
          font-size: 13px;
          background: #f0fdf4;
          border-top: 2px solid #16a34a;
        }
        table.entries tr.total-neg td {
          font-weight: 700;
          font-size: 13px;
          background: #fef2f2;
          border-top: 2px solid #dc2626;
          color: #dc2626;
        }
        .composition {
          background: #f8f9fa;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 12px 16px;
          font-size: 12px;
          margin-bottom: 16px;
        }
        .composition .line {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .composition .line.deduction { color: #dc2626; }
        .composition .line.total {
          border-top: 1px solid #d1d5db;
          margin-top: 6px;
          padding-top: 6px;
          font-weight: 700;
          font-size: 13px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 11px;
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
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>

      <div className="header-bar">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Demonstrativo de Repasse - {formatMonthLabel(month)}</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
        </div>
      </div>

      {/* Dados do Proprietário */}
      <div className="section">
        <div className="section-title">Proprietario</div>
        <div className="info-grid">
          <div>
            <span className="label">Nome: </span>
            <span className="value">{o.name}</span>
          </div>
          <div>
            <span className="label">CPF/CNPJ: </span>
            <span className="value">{o.cpfCnpj}</span>
          </div>
          {o.email && (
            <div>
              <span className="label">Email: </span>
              <span className="value">{o.email}</span>
            </div>
          )}
          {o.phone && (
            <div>
              <span className="label">Telefone: </span>
              <span className="value">{o.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Dados Bancários */}
      <div className="section">
        <div className="section-title">Dados Bancarios para Repasse</div>
        <div className="info-grid">
          <div>
            <span className="label">Recebedor: </span>
            <span className="value">{recipientName}</span>
          </div>
          {recipientDoc && (
            <div>
              <span className="label">CPF/CNPJ: </span>
              <span className="value">{recipientDoc}</span>
            </div>
          )}
          {bankName && (
            <div>
              <span className="label">Banco: </span>
              <span className="value">{bankName}</span>
            </div>
          )}
          {bankAg && (
            <div>
              <span className="label">Agencia: </span>
              <span className="value">{bankAg}</span>
            </div>
          )}
          {bankCc && (
            <div>
              <span className="label">Conta: </span>
              <span className="value">{bankCc}</span>
            </div>
          )}
          {pixKey && (
            <div>
              <span className="label">Chave PIX{pixType ? ` (${pixType})` : ""}: </span>
              <span className="value">{pixKey}</span>
            </div>
          )}
        </div>
      </div>

      {/* Composição do Aluguel */}
      {aluguelBruto > 0 && (
        <div className="section">
          <div className="section-title">Composicao do Aluguel</div>
          <div className="composition">
            <div className="line">
              <span>Aluguel bruto</span>
              <span>{formatCurrency(Math.round(aluguelBruto * 100) / 100)}</span>
            </div>
            {adminFeeValue > 0 && (
              <div className="line deduction">
                <span>(-) Taxa de administracao ({adminFeePercent}%)</span>
                <span>-{formatCurrency(Math.round(adminFeeValue * 100) / 100)}</span>
              </div>
            )}
            {intermediacao > 0 && (
              <div className="line deduction">
                <span>(-) Intermediacao</span>
                <span>-{formatCurrency(Math.round(intermediacao * 100) / 100)}</span>
              </div>
            )}
            {irrfValue > 0 && (
              <div className="line deduction">
                <span>(-) IRRF</span>
                <span>-{formatCurrency(Math.round(irrfValue * 100) / 100)}</span>
              </div>
            )}
            <div className="line total">
              <span>Liquido do aluguel</span>
              <span>{formatCurrency(Math.round((aluguelBruto - adminFeeValue - intermediacao - irrfValue) * 100) / 100)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Lançamentos */}
      <div className="section">
        <div className="section-title">Lancamentos do Periodo</div>
        <table className="entries">
          <thead>
            <tr>
              <th>Descricao</th>
              <th>Categoria</th>
              <th>Vencimento</th>
              <th className="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {creditEntries.map((e) => (
              <tr key={e.id}>
                <td>{e.description}</td>
                <td>{e.category}</td>
                <td>{formatDate(e.dueDate)}</td>
                <td className="right bold">{formatCurrency(e.value)}</td>
              </tr>
            ))}
            {debitEntries.length > 0 && (
              <>
                <tr>
                  <td colSpan={4} style={{ background: "#fef2f2", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3px", color: "#dc2626" }}>
                    Debitos a descontar
                  </td>
                </tr>
                {debitEntries.map((e) => (
                  <tr key={e.id} className="debit">
                    <td>{e.description}</td>
                    <td>{e.category}</td>
                    <td>{formatDate(e.dueDate)}</td>
                    <td className="right bold">-{formatCurrency(e.value)}</td>
                  </tr>
                ))}
              </>
            )}
            <tr className={totalLiquido >= 0 ? "total" : "total-neg"}>
              <td colSpan={3}>Valor Liquido do Repasse</td>
              <td className="right">{formatCurrency(Math.round(totalLiquido * 100) / 100)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="footer">
        <p>Somma Imoveis - Demonstrativo de Repasse - {formatMonthLabel(month)}</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

export default function DemonstrativoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <DemonstrativoContent />
    </Suspense>
  );
}
