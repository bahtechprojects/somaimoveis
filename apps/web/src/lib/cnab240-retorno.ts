// ==================================================
// Parser de Arquivo CNAB 240 Retorno - Sicredi (748)
// Pagamento a Fornecedor
// ==================================================

export interface RetornoOcorrencia {
  codigo: string;
  descricao: string;
  sucesso: boolean;
}

export interface RetornoPagamento {
  segmento: string; // "A", "B", etc.
  sequencial: number;
  lote: number;
  favorecidoNome: string;
  favorecidoBanco: string;
  favorecidoAgencia: string;
  favorecidoConta: string;
  favorecidoContaDv: string;
  favorecidoDocumento: string; // CPF/CNPJ do segmento B
  valorPagamento: number;
  valorEfetivado: number;
  dataPagamento: string;
  dataEfetivacao: string;
  documentoEmpresa: string; // Nro documento cliente (usado para rastrear)
  ocorrencias: RetornoOcorrencia[];
  sucesso: boolean;
  informacoes: string;
}

export interface RetornoArquivo {
  banco: string;
  empresa: string;
  convenio: string;
  dataGeracao: string;
  horaGeracao: string;
  sequencialArquivo: number;
  totalLotes: number;
  totalRegistros: number;
  pagamentos: RetornoPagamento[];
  resumo: {
    total: number;
    sucesso: number;
    erro: number;
    valorTotal: number;
    valorEfetivado: number;
  };
}

// Mapa de códigos de ocorrência CNAB 240 Sicredi
const OCORRENCIAS: Record<string, { descricao: string; sucesso: boolean }> = {
  "00": { descricao: "Crédito ou débito efetivado", sucesso: true },
  "01": { descricao: "Insuficiência de fundos - débito não efetuado", sucesso: false },
  "02": { descricao: "Crédito ou débito cancelado pelo pagador/credor", sucesso: false },
  "03": { descricao: "Débito autorizado pela agência - Loss", sucesso: true },
  "AA": { descricao: "Controle inválido", sucesso: false },
  "AB": { descricao: "Tipo de operação inválido", sucesso: false },
  "AC": { descricao: "Tipo de serviço inválido", sucesso: false },
  "AD": { descricao: "Forma de lançamento inválida", sucesso: false },
  "AE": { descricao: "Tipo/número de inscrição inválido", sucesso: false },
  "AF": { descricao: "Código de convênio inválido", sucesso: false },
  "AG": { descricao: "Agência/conta corrente/DV inválido", sucesso: false },
  "AH": { descricao: "Número sequencial do registro no lote inválido", sucesso: false },
  "AI": { descricao: "Código de segmento de detalhe inválido", sucesso: false },
  "AJ": { descricao: "Tipo de movimento inválido", sucesso: false },
  "AK": { descricao: "Código da câmara de compensação inválido", sucesso: false },
  "AL": { descricao: "Código do banco favorecido inválido", sucesso: false },
  "AM": { descricao: "Agência do favorecido inválida", sucesso: false },
  "AN": { descricao: "Conta corrente/DV do favorecido inválido", sucesso: false },
  "AO": { descricao: "Nome do favorecido não informado", sucesso: false },
  "AP": { descricao: "Data do lançamento inválida", sucesso: false },
  "AQ": { descricao: "Tipo/quantidade de moeda inválida", sucesso: false },
  "AR": { descricao: "Valor do lançamento inválido", sucesso: false },
  "AS": { descricao: "Aviso ao favorecido - identificação inválida", sucesso: false },
  "AT": { descricao: "Tipo/número de inscrição do favorecido inválido", sucesso: false },
  "AU": { descricao: "Logradouro do favorecido não informado", sucesso: false },
  "AV": { descricao: "Número do local do favorecido não informado", sucesso: false },
  "AW": { descricao: "Cidade do favorecido não informada", sucesso: false },
  "AX": { descricao: "CEP do favorecido inválido", sucesso: false },
  "AY": { descricao: "UF do favorecido inválida", sucesso: false },
  "AZ": { descricao: "Código/nome do banco depositário inválido", sucesso: false },
  "BA": { descricao: "Código/nome da agência depositária inválido", sucesso: false },
  "BB": { descricao: "Seu número inválido", sucesso: false },
  "BC": { descricao: "Nosso número inválido", sucesso: false },
  "BD": { descricao: "Inclusão efetuada com sucesso (agendamento)", sucesso: true },
  "BE": { descricao: "Alteração efetuada com sucesso", sucesso: true },
  "BF": { descricao: "Exclusão efetuada com sucesso", sucesso: true },
  "BG": { descricao: "Agência/conta impedida legalmente", sucesso: false },
  "BH": { descricao: "Empresa não pagou salário", sucesso: false },
  "BI": { descricao: "Falecimento do mutuário", sucesso: false },
  "BJ": { descricao: "Empresa não enviou remessa de mutuário", sucesso: false },
  "BK": { descricao: "Empresa não enviou remessa no vencimento", sucesso: false },
  "BL": { descricao: "Valor da parcela inválido", sucesso: false },
  "BM": { descricao: "Identificação do contrato inválida", sucesso: false },
  "BN": { descricao: "Operação de consignação incluída com sucesso", sucesso: true },
  "BO": { descricao: "Operação de consignação alterada com sucesso", sucesso: true },
  "BP": { descricao: "Operação de consignação excluída com sucesso", sucesso: true },
  "BQ": { descricao: "Operação de consignação liquidada com sucesso", sucesso: true },
  "CA": { descricao: "Código de barras - código do banco inválido", sucesso: false },
  "CB": { descricao: "Código de barras - código da moeda inválido", sucesso: false },
  "CC": { descricao: "Código de barras - DV geral inválido", sucesso: false },
  "CD": { descricao: "Código de barras - valor do título inválido", sucesso: false },
  "CE": { descricao: "Código de barras - campo livre inválido", sucesso: false },
  "CF": { descricao: "Valor do documento inválido", sucesso: false },
  "CG": { descricao: "Valor do abatimento inválido", sucesso: false },
  "CH": { descricao: "Valor do desconto inválido", sucesso: false },
  "CI": { descricao: "Valor de mora inválido", sucesso: false },
  "CJ": { descricao: "Valor da multa inválido", sucesso: false },
  "CK": { descricao: "Valor do IR inválido", sucesso: false },
  "CL": { descricao: "Valor do ISS inválido", sucesso: false },
  "CM": { descricao: "Valor do IOF inválido", sucesso: false },
  "CN": { descricao: "Valor de outras deduções inválido", sucesso: false },
  "CO": { descricao: "Valor de outros acréscimos inválido", sucesso: false },
  "H4": { descricao: "Retorno de crédito não pago (estorno)", sucesso: false },
  "PA": { descricao: "PIX não efetivado", sucesso: false },
  "PB": { descricao: "Transação interrompida - erro no PSP do recebedor", sucesso: false },
  "PC": { descricao: "Conta transacional encerrada no PSP do recebedor", sucesso: false },
  "PD": { descricao: "Tipo incorreto para conta transacional", sucesso: false },
  "PE": { descricao: "Tipo de transação não suportado na conta", sucesso: false },
  "PF": { descricao: "CPF/CNPJ não consistente com titular da conta", sucesso: false },
  "PG": { descricao: "CPF/CNPJ do recebedor incorreto", sucesso: false },
  "PH": { descricao: "Ordem rejeitada pelo PSP do recebedor", sucesso: false },
  "PI": { descricao: "ISPB do PSP do pagador inválido", sucesso: false },
  "PJ": { descricao: "Chave não cadastrada no DICT", sucesso: false },
  "PK": { descricao: "QR Code inválido/vencido", sucesso: false },
  "PL": { descricao: "Forma de iniciação inválida", sucesso: false },
  "PM": { descricao: "Chave de pagamento inválida", sucesso: false },
  "PN": { descricao: "Chave de pagamento não informada", sucesso: false },
  "TA": { descricao: "Lote não aceito - totais do lote com diferença", sucesso: false },
  "YA": { descricao: "Título não encontrado", sucesso: false },
  "ZA": { descricao: "Agência/conta do favorecido substituída", sucesso: true },
};

function parseOcorrencias(campo: string): RetornoOcorrencia[] {
  const ocorrencias: RetornoOcorrencia[] = [];
  const trimmed = campo.trim();
  if (!trimmed) return ocorrencias;

  // Cada ocorrência tem 2 caracteres
  for (let i = 0; i < trimmed.length; i += 2) {
    const codigo = trimmed.substring(i, i + 2).trim();
    if (!codigo) continue;
    const info = OCORRENCIAS[codigo];
    ocorrencias.push({
      codigo,
      descricao: info?.descricao || `Código desconhecido: ${codigo}`,
      sucesso: info?.sucesso ?? false,
    });
  }
  return ocorrencias;
}

function parseDate(ddmmaaaa: string): string {
  const d = ddmmaaaa.substring(0, 2);
  const m = ddmmaaaa.substring(2, 4);
  const a = ddmmaaaa.substring(4, 8);
  if (a === "0000" || d === "00") return "";
  return `${d}/${m}/${a}`;
}

function parseValor(centavos: string): number {
  const num = parseInt(centavos, 10);
  return isNaN(num) ? 0 : num / 100;
}

export function parseCnab240Retorno(content: string): RetornoArquivo {
  // Normalizar quebras de linha e separar registros
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.length >= 240);

  if (lines.length === 0) {
    throw new Error("Arquivo vazio ou formato inválido");
  }

  // Verificar se é retorno (posição 143 = "2") ou pelo menos um arquivo CNAB 240
  const headerArquivo = lines[0];
  const banco = headerArquivo.substring(0, 3);
  const tipoRegistro = headerArquivo.substring(7, 8);

  if (banco !== "748") {
    throw new Error(`Banco ${banco} não é Sicredi (748)`);
  }
  if (tipoRegistro !== "0") {
    throw new Error("Primeira linha não é header de arquivo (tipo 0)");
  }

  // Parse header arquivo
  const empresa = headerArquivo.substring(72, 102).trim();
  const convenio = headerArquivo.substring(32, 36).trim();
  const dataGeracao = parseDate(headerArquivo.substring(143, 151));
  const horaGeracao = headerArquivo.substring(151, 157);
  const sequencialArquivo = parseInt(headerArquivo.substring(157, 163), 10);

  const pagamentos: RetornoPagamento[] = [];
  let currentSegA: Partial<RetornoPagamento> | null = null;

  for (const line of lines) {
    const tipo = line.substring(7, 8);

    // Segmento A (detalhe tipo 3, segmento A)
    if (tipo === "3" && line.substring(13, 14) === "A") {
      const ocorrenciasCampo = line.substring(230, 240);
      const ocorrencias = parseOcorrencias(ocorrenciasCampo);
      const sucesso = ocorrencias.length > 0 && ocorrencias.every(o => o.sucesso);

      currentSegA = {
        segmento: "A",
        lote: parseInt(line.substring(3, 7), 10),
        sequencial: parseInt(line.substring(8, 13), 10),
        favorecidoBanco: line.substring(20, 23).trim(),
        favorecidoAgencia: line.substring(23, 28).trim(),
        favorecidoConta: line.substring(29, 41).trim(),
        favorecidoContaDv: line.substring(41, 42).trim(),
        favorecidoNome: line.substring(43, 73).trim(),
        documentoEmpresa: line.substring(73, 93).trim(),
        dataPagamento: parseDate(line.substring(93, 101)),
        valorPagamento: parseValor(line.substring(119, 134)),
        dataEfetivacao: parseDate(line.substring(154, 162)),
        valorEfetivado: parseValor(line.substring(162, 177)),
        informacoes: line.substring(177, 217).trim(),
        ocorrencias,
        sucesso,
        favorecidoDocumento: "",
      };
    }

    // Segmento B (complemento do A)
    if (tipo === "3" && line.substring(13, 14) === "B" && currentSegA) {
      // CPF/CNPJ do favorecido: posições 018-032 (para TED/CC) ou varia para PIX
      const tipoInscricao = line.substring(17, 18);
      const documento = line.substring(18, 32).replace(/^0+/, "");
      currentSegA.favorecidoDocumento = documento;

      // Adicionar ao array
      pagamentos.push(currentSegA as RetornoPagamento);
      currentSegA = null;
    }
  }

  // Se ficou um segmento A sem B, adicionar mesmo assim
  if (currentSegA) {
    pagamentos.push(currentSegA as RetornoPagamento);
  }

  // Parse trailer arquivo
  const trailerArquivo = lines[lines.length - 1];
  let totalLotes = 0;
  let totalRegistros = 0;
  if (trailerArquivo.substring(7, 8) === "9") {
    totalLotes = parseInt(trailerArquivo.substring(17, 23), 10);
    totalRegistros = parseInt(trailerArquivo.substring(23, 29), 10);
  }

  // Resumo
  const totalSucesso = pagamentos.filter(p => p.sucesso).length;
  const totalErro = pagamentos.filter(p => !p.sucesso).length;
  const valorTotal = pagamentos.reduce((s, p) => s + p.valorPagamento, 0);
  const valorEfetivado = pagamentos.filter(p => p.sucesso).reduce((s, p) => s + (p.valorEfetivado || p.valorPagamento), 0);

  return {
    banco,
    empresa,
    convenio,
    dataGeracao,
    horaGeracao,
    sequencialArquivo,
    totalLotes,
    totalRegistros,
    pagamentos,
    resumo: {
      total: pagamentos.length,
      sucesso: totalSucesso,
      erro: totalErro,
      valorTotal: Math.round(valorTotal * 100) / 100,
      valorEfetivado: Math.round(valorEfetivado * 100) / 100,
    },
  };
}
