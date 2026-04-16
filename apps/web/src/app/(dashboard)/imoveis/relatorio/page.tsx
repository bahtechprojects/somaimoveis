"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface PropertyData {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  furnished: boolean;
  registrationNumber: string | null;
  iptuNumber: string | null;
  energyMeter: string | null;
  waterMeter: string | null;
  gasMeter: string | null;
  condoAdmin: string | null;
  rentalValue: number | null;
  saleValue: number | null;
  condoFee: number | null;
  iptuValue: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  owner: { id: string; name: string; cpfCnpj: string; email: string | null; phone: string | null } | null;
  photos: { id: string; url: string; caption: string | null }[];
  contracts: ContractData[];
}

interface ContractData {
  id: string;
  code: string;
  type: string;
  status: string;
  rentalValue: number;
  startDate: string | null;
  endDate: string | null;
  adminFeePercent: number | null;
  tenant: { id: string; name: string; cpfCnpj: string } | null;
}

function formatCurrency(value: number | null): string {
  if (value == null || value === 0) return "-";
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

function formatAddress(p: PropertyData): string {
  const parts = [];
  if (p.street) {
    let line = p.street;
    if (p.number) line += `, ${p.number}`;
    if (p.complement) line += ` - ${p.complement}`;
    parts.push(line);
  }
  if (p.neighborhood) parts.push(p.neighborhood);
  if (p.city && p.state) parts.push(`${p.city}/${p.state}`);
  else if (p.city) parts.push(p.city);
  if (p.zipCode) parts.push(`CEP: ${p.zipCode}`);
  return parts.join(" | ");
}

const typeLabels: Record<string, string> = {
  CASA: "Casa",
  APARTAMENTO: "Apartamento",
  COMERCIAL: "Comercial",
  TERRENO: "Terreno",
  SALA: "Sala",
  PAVILHAO: "Pavilhao",
};

const statusLabels: Record<string, string> = {
  DISPONIVEL: "Disponivel",
  ALUGADO: "Alugado",
  MANUTENCAO: "Em Manutencao",
  INATIVO: "Inativo",
};

const contractStatusLabels: Record<string, string> = {
  ATIVO: "Ativo",
  ENCERRADO: "Encerrado",
  PENDENTE_RENOVACAO: "Pendente Renovacao",
  CANCELADO: "Cancelado",
};

function RelatorioContent() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("id");
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    fetch(`/api/properties/${propertyId}`)
      .then((r) => r.json())
      .then((data) => setProperty(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => {
    if (!loading && property) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, property]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Carregando relatorio...</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">Imovel nao encontrado.</p>
      </div>
    );
  }

  const activeContracts = property.contracts.filter((c) => c.status === "ATIVO");
  const pastContracts = property.contracts.filter((c) => c.status !== "ATIVO");
  const today = new Date().toLocaleDateString("pt-BR");
  const monthlyTotal = (property.rentalValue || 0) + (property.condoFee || 0) + (property.iptuValue || 0);

  return (
    <div className="relatorio-page">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .relatorio-page { padding: 20px; }
          .page-break { page-break-before: always; }
        }
        @media screen {
          .relatorio-page {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 30px;
          }
        }
        .relatorio-page {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #1a1a1a;
          font-size: 13px;
          line-height: 1.5;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #2563eb;
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        .header-bar h1 {
          font-size: 22px;
          font-weight: 700;
          color: #2563eb;
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
        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .badge-alugado { background: #dbeafe; color: #1d4ed8; }
        .badge-disponivel { background: #dcfce7; color: #16a34a; }
        .badge-manutencao { background: #fef3c7; color: #d97706; }
        .badge-inativo { background: #f3f4f6; color: #6b7280; }
        .badge-ativo { background: #dcfce7; color: #16a34a; }
        .badge-encerrado { background: #f3f4f6; color: #6b7280; }
        .badge-cancelado { background: #fee2e2; color: #dc2626; }
        .section {
          margin-bottom: 20px;
        }
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
        .info-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px 24px;
          font-size: 12px;
        }
        .info-grid .label, .info-grid-3 .label {
          color: #888;
          font-size: 11px;
        }
        .info-grid .value, .info-grid-3 .value {
          font-weight: 500;
        }
        .info-grid .full-width {
          grid-column: 1 / -1;
        }
        .financial-box {
          background: #f8f9fa;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 12px 16px;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .financial-box .line {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .financial-box .line.total {
          border-top: 1px solid #d1d5db;
          margin-top: 6px;
          padding-top: 6px;
          font-weight: 700;
          font-size: 13px;
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
        .codes-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          font-size: 12px;
        }
        .code-item {
          background: #f8f9fa;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 8px 12px;
        }
        .code-item .code-label {
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .code-item .code-value {
          font-weight: 600;
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }
        .notes-box {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 12px 16px;
          font-size: 12px;
          color: #92400e;
          white-space: pre-wrap;
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

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1>Somma Imoveis</h1>
          <p className="subtitle">Ficha do Imovel</p>
        </div>
        <div className="header-right">
          <div>Emitido em: {today}</div>
          <span className={`badge badge-${property.status.toLowerCase()}`}>
            {statusLabels[property.status] || property.status}
          </span>
        </div>
      </div>

      {/* Identificacao */}
      <div className="section">
        <div className="section-title">Identificacao</div>
        <div className="info-grid">
          <div>
            <span className="label">Titulo: </span>
            <span className="value">{property.title}</span>
          </div>
          <div>
            <span className="label">Tipo: </span>
            <span className="value">{typeLabels[property.type] || property.type}</span>
          </div>
          <div className="full-width" style={{ marginTop: 4 }}>
            <span className="label">Endereco: </span>
            <span className="value">{formatAddress(property) || "-"}</span>
          </div>
          {property.description && (
            <div className="full-width" style={{ marginTop: 4 }}>
              <span className="label">Descricao: </span>
              <span className="value">{property.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* Caracteristicas */}
      <div className="section">
        <div className="section-title">Caracteristicas</div>
        <div className="info-grid-3">
          <div>
            <span className="label">Area: </span>
            <span className="value">{property.area ? `${property.area} m²` : "-"}</span>
          </div>
          <div>
            <span className="label">Quartos: </span>
            <span className="value">{property.bedrooms ?? "-"}</span>
          </div>
          <div>
            <span className="label">Banheiros: </span>
            <span className="value">{property.bathrooms ?? "-"}</span>
          </div>
          <div>
            <span className="label">Vagas: </span>
            <span className="value">{property.parkingSpaces ?? "-"}</span>
          </div>
          <div>
            <span className="label">Mobiliado: </span>
            <span className="value">{property.furnished ? "Sim" : "Nao"}</span>
          </div>
        </div>
      </div>

      {/* Proprietario */}
      {property.owner && (
        <div className="section">
          <div className="section-title">Proprietario</div>
          <div className="info-grid">
            <div>
              <span className="label">Nome: </span>
              <span className="value">{property.owner.name}</span>
            </div>
            <div>
              <span className="label">CPF/CNPJ: </span>
              <span className="value">{property.owner.cpfCnpj}</span>
            </div>
            {property.owner.email && (
              <div>
                <span className="label">Email: </span>
                <span className="value">{property.owner.email}</span>
              </div>
            )}
            {property.owner.phone && (
              <div>
                <span className="label">Telefone: </span>
                <span className="value">{property.owner.phone}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Valores */}
      <div className="section">
        <div className="section-title">Valores</div>
        <div className="financial-box">
          {property.rentalValue ? (
            <div className="line">
              <span>Aluguel</span>
              <span>{formatCurrency(property.rentalValue)}</span>
            </div>
          ) : null}
          {property.condoFee ? (
            <div className="line">
              <span>Condominio</span>
              <span>{formatCurrency(property.condoFee)}</span>
            </div>
          ) : null}
          {property.iptuValue ? (
            <div className="line">
              <span>IPTU</span>
              <span>{formatCurrency(property.iptuValue)}</span>
            </div>
          ) : null}
          {property.saleValue ? (
            <div className="line">
              <span>Valor de venda</span>
              <span>{formatCurrency(property.saleValue)}</span>
            </div>
          ) : null}
          {monthlyTotal > 0 && (
            <div className="line total">
              <span>Total mensal (aluguel + encargos)</span>
              <span>{formatCurrency(monthlyTotal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Codigos e Registros */}
      {(property.registrationNumber || property.iptuNumber || property.energyMeter || property.waterMeter || property.gasMeter || property.condoAdmin) && (
        <div className="section">
          <div className="section-title">Codigos e Registros</div>
          <div className="codes-grid">
            {property.registrationNumber && (
              <div className="code-item">
                <div className="code-label">Matricula</div>
                <div className="code-value">{property.registrationNumber}</div>
              </div>
            )}
            {property.iptuNumber && (
              <div className="code-item">
                <div className="code-label">IPTU</div>
                <div className="code-value">{property.iptuNumber}</div>
              </div>
            )}
            {property.energyMeter && (
              <div className="code-item">
                <div className="code-label">Medidor Energia</div>
                <div className="code-value">{property.energyMeter}</div>
              </div>
            )}
            {property.waterMeter && (
              <div className="code-item">
                <div className="code-label">Medidor Agua</div>
                <div className="code-value">{property.waterMeter}</div>
              </div>
            )}
            {property.gasMeter && (
              <div className="code-item">
                <div className="code-label">Medidor Gas</div>
                <div className="code-value">{property.gasMeter}</div>
              </div>
            )}
            {property.condoAdmin && (
              <div className="code-item">
                <div className="code-label">Adm. Condominio</div>
                <div className="code-value">{property.condoAdmin}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contratos Ativos */}
      {activeContracts.length > 0 && (
        <div className="section">
          <div className="section-title">Contrato(s) Ativo(s)</div>
          <table className="entries">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Locatario</th>
                <th>Inicio</th>
                <th>Termino</th>
                <th>Taxa Adm</th>
                <th className="right">Aluguel</th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.map((c) => (
                <tr key={c.id}>
                  <td className="bold">{c.code}</td>
                  <td>
                    {c.tenant?.name || "-"}
                    {c.tenant?.cpfCnpj && (
                      <span style={{ display: "block", fontSize: 10, color: "#888" }}>{c.tenant.cpfCnpj}</span>
                    )}
                  </td>
                  <td>{formatDate(c.startDate)}</td>
                  <td>{formatDate(c.endDate)}</td>
                  <td>{c.adminFeePercent != null ? `${c.adminFeePercent}%` : "-"}</td>
                  <td className="right bold">{formatCurrency(c.rentalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historico de Contratos */}
      {pastContracts.length > 0 && (
        <div className="section">
          <div className="section-title">Historico de Contratos</div>
          <table className="entries">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Locatario</th>
                <th>Status</th>
                <th>Inicio</th>
                <th>Termino</th>
                <th className="right">Aluguel</th>
              </tr>
            </thead>
            <tbody>
              {pastContracts.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.tenant?.name || "-"}</td>
                  <td>
                    <span className={`badge badge-${c.status.toLowerCase()}`}>
                      {contractStatusLabels[c.status] || c.status}
                    </span>
                  </td>
                  <td>{formatDate(c.startDate)}</td>
                  <td>{formatDate(c.endDate)}</td>
                  <td className="right">{formatCurrency(c.rentalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Observacoes */}
      {property.notes && (
        <div className="section">
          <div className="section-title">Observacoes</div>
          <div className="notes-box">{property.notes}</div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <p>Somma Imoveis - Ficha do Imovel - {property.title}</p>
        <p>Documento gerado automaticamente em {today}</p>
      </div>
    </div>
  );
}

export default function RelatorioImovelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
