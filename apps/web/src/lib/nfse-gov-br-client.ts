/**
 * Cliente HTTP para NFS-e Padrão Nacional (gov.br).
 *
 * Documentação:
 *   https://www.gov.br/nfse/pt-br
 *   https://www.gov.br/nfse/pt-br/centrais-de-conteudo/manuais-1
 *
 * Endpoints:
 *   Homologação: https://hom.nfse.gov.br/SefinNacional
 *   Produção:    https://www.nfse.gov.br/SefinNacional
 *
 * Autenticação: mTLS com certificado A1 da empresa emissora.
 *
 * STATUS: ESQUELETO. As funções principais estão estruturadas mas o envio
 * real (assinatura XAdES + mTLS) ainda não foi implementado. Vai ser ligado
 * quando o certificado estiver subido e a empresa cadastrada no portal
 * gov.br como "Emissor por Aplicativo".
 *
 * Para implementação completa precisaremos de:
 * 1) Geração do XML DPS (Declaração de Prestação de Serviços)
 * 2) Assinatura digital XAdES-Enveloped com xml-crypto + node-forge
 * 3) Cliente HTTPS com mTLS (https.Agent com cert/key extraídos do PFX)
 * 4) Tratamento das respostas SEFIN (consulta async via NSU)
 */

export type Ambiente = "HOMOLOGACAO" | "PRODUCAO";

const ENDPOINT = {
  HOMOLOGACAO: "https://hom.nfse.gov.br/SefinNacional",
  PRODUCAO: "https://www.nfse.gov.br/SefinNacional",
} as const;

export interface EmitirNFSeParams {
  ambiente: Ambiente;
  certificado: {
    pfx: Buffer;        // raw PFX bytes
    password: string;   // senha em claro (já descriptografada antes de chamar)
  };
  prestador: {
    cnpj: string;       // só dígitos
    inscricaoMunicipal: string;
    razaoSocial: string;
    regimeTributario: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL" | "MEI";
  };
  tomador: {
    tipo: "PF" | "PJ";
    documento: string;  // só dígitos
    nome: string;
    email?: string;
    endereco?: {
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      cep: string;
    };
  };
  servico: {
    codigoServico: string;   // ex: "10.05"
    discriminacao: string;
    valorServicos: number;
    aliquotaIss: number;     // ex: 2 (= 2%)
    issRetido: boolean;
    municipioPrestacao: string; // codigo IBGE (ex: 4316808 = Santa Cruz do Sul)
  };
  rps?: {
    serie: string;
    numero: number;
  };
}

export interface EmitirNFSeResult {
  sucesso: boolean;
  // Quando sucesso:
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  chaveAcesso?: string;
  pdfUrl?: string;
  xmlRetorno?: string;
  // Quando falha:
  rejeicaoCodigo?: string;
  rejeicaoMotivo?: string;
  // Sempre:
  ambiente: Ambiente;
  dpsXml?: string;  // XML enviado (pra auditoria)
}

/**
 * Emite uma NFS-e no Padrão Nacional.
 *
 * IMPLEMENTAÇÃO PENDENTE: por enquanto retorna mock. Quando o cliente real
 * for implementado:
 *  1. Extrai certificado e chave privada do .pfx
 *  2. Monta o XML DPS conforme o schema do Padrão Nacional
 *  3. Assina o XML com XAdES-Enveloped
 *  4. Faz POST mTLS no endpoint /nfse com o XML assinado
 *  5. Recebe NSU + processa retorno (autorização ou rejeição)
 */
export async function emitirNFSe(params: EmitirNFSeParams): Promise<EmitirNFSeResult> {
  const baseUrl = ENDPOINT[params.ambiente];

  // STUB: retorna sucesso simulado (com numero gerado aleatoriamente).
  // Quando integrar de verdade, substitui por POST real ao baseUrl.
  if (process.env.NFSE_MOCK !== "false") {
    console.log("[NFS-e MOCK]", {
      ambiente: params.ambiente,
      cnpj: params.prestador.cnpj,
      tomador: params.tomador.nome,
      valor: params.servico.valorServicos,
      base: baseUrl,
    });
    return {
      sucesso: true,
      numero: `${Math.floor(Math.random() * 100000).toString().padStart(8, "0")}`,
      serie: "1",
      codigoVerificacao: Math.random().toString(36).substring(2, 10).toUpperCase(),
      chaveAcesso: `${params.prestador.cnpj}${Date.now()}`.substring(0, 50),
      ambiente: params.ambiente,
      dpsXml: "<DPS>... (mock) ...</DPS>",
    };
  }

  // TODO: implementacao real abaixo
  throw new Error(
    "Integracao real com NFS-e gov.br ainda nao implementada. " +
    "Use NFSE_MOCK=true para teste em desenvolvimento.",
  );
}

export interface ConsultarNFSeParams {
  ambiente: Ambiente;
  certificado: { pfx: Buffer; password: string };
  numero: string;
  cnpjPrestador: string;
}

export async function consultarNFSe(_params: ConsultarNFSeParams): Promise<{
  status: "AUTORIZADA" | "PROCESSANDO" | "REJEITADA" | "CANCELADA" | "NAO_ENCONTRADA";
  pdfUrl?: string;
  xml?: string;
  motivo?: string;
}> {
  // STUB
  return { status: "AUTORIZADA" };
}

export interface CancelarNFSeParams {
  ambiente: Ambiente;
  certificado: { pfx: Buffer; password: string };
  numero: string;
  cnpjPrestador: string;
  motivo: string;
}

export async function cancelarNFSe(_params: CancelarNFSeParams): Promise<{
  sucesso: boolean;
  motivo?: string;
}> {
  // STUB
  return { sucesso: true };
}

/**
 * Codigos IBGE para municipios do RS (lista parcial — adiciona conforme precisar)
 */
export const IBGE_CODES_RS: Record<string, string> = {
  "SANTA CRUZ DO SUL": "4316808",
  "PORTO ALEGRE": "4314902",
  "VENANCIO AIRES": "4322509",
  "CANOAS": "4304606",
  "PELOTAS": "4314407",
  "CAXIAS DO SUL": "4305108",
  "NOVO HAMBURGO": "4313409",
};

export function getIbgeCode(city: string, state: string): string | null {
  if (state.toUpperCase() !== "RS") return null;
  const key = city.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return IBGE_CODES_RS[key] || null;
}
