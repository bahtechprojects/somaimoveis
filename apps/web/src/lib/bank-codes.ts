// ==================================================
// Dicionário Nome → Código COMPE de bancos brasileiros
// ==================================================
// Usado pelo CNAB 240 quando o admin cadastra o banco como
// texto livre (ex: "Sicredi", "Banco do Brasil"). Converte
// pro código numérico de 3 digitos exigido pelo Sicredi.

const BANK_NAME_TO_CODE: Array<{ patterns: string[]; code: string }> = [
  // Bancos publicos / grandes
  { patterns: ["banco do brasil", "bb", "001"], code: "001" },
  { patterns: ["caixa", "cef", "caixa economica", "caixa econômica", "104"], code: "104" },
  { patterns: ["santander", "santander brasil", "033"], code: "033" },
  { patterns: ["bradesco", "237"], code: "237" },
  { patterns: ["itau", "itaú", "itau unibanco", "341"], code: "341" },
  { patterns: ["banrisul", "041"], code: "041" },
  { patterns: ["brb", "070"], code: "070" },
  { patterns: ["safra", "422"], code: "422" },
  { patterns: ["citibank", "citi", "745"], code: "745" },
  { patterns: ["hsbc", "399"], code: "399" },
  { patterns: ["banco original", "original", "212"], code: "212" },
  { patterns: ["banco bmg", "bmg", "318"], code: "318" },
  { patterns: ["banco daycoval", "daycoval", "707"], code: "707" },
  { patterns: ["bs2", "banco bs2", "218"], code: "218" },
  { patterns: ["sofisa", "637"], code: "637" },
  { patterns: ["banco rendimento", "rendimento", "633"], code: "633" },
  { patterns: ["votorantim", "banco bv", "bv", "655"], code: "655" },
  { patterns: ["banco pan", "pan", "623"], code: "623" },
  { patterns: ["banco mercantil", "mercantil", "389"], code: "389" },
  { patterns: ["banco bnb", "banco do nordeste", "nordeste", "004"], code: "004" },
  { patterns: ["banco da amazonia", "banco amazonia", "amazonia", "amazônia", "003"], code: "003" },

  // Cooperativas
  { patterns: ["sicredi", "748"], code: "748" },
  { patterns: ["sicoob", "bancoob", "756"], code: "756" },
  { patterns: ["unicred", "136"], code: "136" },
  { patterns: ["banco cooperativo cresol", "cresol", "133"], code: "133" },
  { patterns: ["ailos", "085"], code: "085" },

  // Digitais
  { patterns: ["nubank", "nu pagamentos", "nu", "260"], code: "260" },
  { patterns: ["banco inter", "inter", "077"], code: "077" },
  { patterns: ["c6 bank", "c6", "336"], code: "336" },
  { patterns: ["pagseguro", "pagbank", "pag seguro", "290"], code: "290" },
  { patterns: ["picpay", "pic pay", "380"], code: "380" },
  { patterns: ["mercado pago", "mercadopago", "323"], code: "323" },
  { patterns: ["banco neon", "neon", "735"], code: "735" },
  { patterns: ["banco modal", "modal", "746"], code: "746" },
  { patterns: ["banco btg pactual", "btg", "208"], code: "208" },
  { patterns: ["banco xp", "xp", "348"], code: "348" },
  { patterns: ["banco asaas", "asaas", "461"], code: "461" },
  { patterns: ["banco genial", "genial", "125"], code: "125" },
  { patterns: ["banco rico", "rico", "102"], code: "102" },
  { patterns: ["banco topazio", "topázio", "topazio", "082"], code: "082" },
  { patterns: ["mercado bitcoin", "450"], code: "450" },
  { patterns: ["cora", "403"], code: "403" },
  { patterns: ["banco bocom bbm", "bocom", "107"], code: "107" },

  // Outros
  { patterns: ["banco abc", "abc brasil", "246"], code: "246" },
  { patterns: ["banco arbi", "213"], code: "213" },
  { patterns: ["banco da china", "069"], code: "069" },
  { patterns: ["banco gerador", "gerador", "121"], code: "121" },
  { patterns: ["banco industrial", "industrial", "604"], code: "604" },
  { patterns: ["banco luso brasileiro", "luso", "600"], code: "600" },
  { patterns: ["banco semear", "semear", "743"], code: "743" },
  { patterns: ["banco triangulo", "triangulo", "634"], code: "634" },
];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Resolve o nome/codigo do banco para o codigo COMPE de 3 digitos.
 *
 * Aceita:
 *  - Codigos numericos: "001", "748", "001-1", "104 - Caixa" → retorna so digitos
 *  - Nomes: "Sicredi", "Banco do Brasil", "BB", "Itaú" → busca no dicionario
 *  - Mistura: "748 - Sicredi", "Banco 001" → extrai digitos primeiro
 *
 * Retorna "" se nao conseguir resolver. O CNAB usa "748" como fallback
 * (sicredi) — mas a melhor pratica e exigir o codigo correto.
 */
export function resolveBankCode(input: string | undefined | null): string {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";

  // Se ja for 3 digitos puros, retorna direto
  if (/^\d{3}$/.test(raw)) return raw;

  // Se tem digitos misturados (ex: "748 - Sicredi", "001-1"), extrai primeiro
  const onlyDigits = raw.replace(/\D/g, "");
  if (onlyDigits.length === 3) return onlyDigits;
  if (onlyDigits.length === 4 && onlyDigits.startsWith("0")) {
    // "0001" → "001"
    return onlyDigits.slice(1);
  }

  // Busca no dicionario por nome
  const normalized = stripDiacritics(raw.toLowerCase()).trim();

  for (const entry of BANK_NAME_TO_CODE) {
    for (const pattern of entry.patterns) {
      const normPattern = stripDiacritics(pattern.toLowerCase());
      if (normalized === normPattern || normalized.includes(normPattern)) {
        return entry.code;
      }
    }
  }

  return "";
}

/**
 * Versao com fallback. Retorna o codigo resolvido ou o fallback (default 748).
 * Use no CNAB quando precisar de um valor garantido.
 */
export function resolveBankCodeOrDefault(
  input: string | undefined | null,
  fallback: string = "748"
): string {
  const code = resolveBankCode(input);
  return code || fallback;
}
