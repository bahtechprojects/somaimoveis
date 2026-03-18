import { useState, useCallback } from "react";

interface CnpjResult {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  situacao_cadastral: string;
  status?: string;
  message?: string;
}

interface UseCnpjLookupOptions {
  onResult: (data: {
    name: string;
    email: string;
    phone: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  }) => void;
}

export function useCnpjLookup({ onResult }: UseCnpjLookupOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, "");
    if (clean.length !== 14) {
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Using receitaws.com.br (free, no auth needed, 3 req/min)
      const res = await fetch(`https://receitaws.com.br/v1/cnpj/${clean}`, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        setError("Limite de consultas atingido. Aguarde 1 minuto.");
        return;
      }

      if (!res.ok) {
        setError("Erro ao consultar CNPJ");
        return;
      }

      const data: CnpjResult = await res.json();

      if (data.status === "ERROR") {
        setError(data.message || "CNPJ não encontrado");
        return;
      }

      // Format phone: remove non-digits, keep area code
      let phone = (data.telefone || "").replace(/[^\d]/g, "");
      if (phone.length > 11) phone = phone.substring(0, 11);

      onResult({
        name: data.nome_fantasia || data.razao_social || "",
        email: (data.email || "").toLowerCase(),
        phone,
        street: data.logradouro || "",
        number: data.numero || "",
        complement: data.complemento || "",
        neighborhood: data.bairro || "",
        city: data.municipio || "",
        state: data.uf || "",
        zipCode: formatCep(data.cep || ""),
      });
      setError(null);
    } catch {
      setError("Erro de conexão ao consultar CNPJ");
    } finally {
      setLoading(false);
    }
  }, [onResult]);

  // Format CNPJ as user types: 00.000.000/0000-00
  const formatCnpj = useCallback((value: string): string => {
    const clean = value.replace(/\D/g, "").substring(0, 14);
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.substring(0, 2)}.${clean.substring(2)}`;
    if (clean.length <= 8) return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5)}`;
    if (clean.length <= 12) return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5, 8)}/${clean.substring(8)}`;
    return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5, 8)}/${clean.substring(8, 12)}-${clean.substring(12)}`;
  }, []);

  // Format CPF: 000.000.000-00
  const formatCpf = useCallback((value: string): string => {
    const clean = value.replace(/\D/g, "").substring(0, 11);
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.substring(0, 3)}.${clean.substring(3)}`;
    if (clean.length <= 9) return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6)}`;
    return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9)}`;
  }, []);

  // Format CPF or CNPJ based on length
  const formatCpfCnpj = useCallback((value: string): string => {
    const clean = value.replace(/\D/g, "");
    if (clean.length <= 11) return formatCpf(value);
    return formatCnpj(value);
  }, [formatCpf, formatCnpj]);

  return { lookup, loading, error, formatCnpj, formatCpf, formatCpfCnpj };
}

function formatCep(value: string): string {
  const clean = value.replace(/\D/g, "").substring(0, 8);
  if (clean.length > 5) return `${clean.substring(0, 5)}-${clean.substring(5)}`;
  return clean;
}
