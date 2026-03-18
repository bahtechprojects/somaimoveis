import { useState, useCallback } from "react";

interface CepResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface UseCepLookupOptions {
  onResult: (data: {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    complement?: string;
  }) => void;
}

export function useCepLookup({ onResult }: UseCepLookupOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) {
        setError("Erro ao buscar CEP");
        return;
      }
      const data: CepResult = await res.json();
      if (data.erro) {
        setError("CEP não encontrado");
        return;
      }
      onResult({
        street: data.logradouro || "",
        neighborhood: data.bairro || "",
        city: data.localidade || "",
        state: data.uf || "",
        complement: data.complemento || "",
      });
      setError(null);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [onResult]);

  // Format CEP as user types: 00000-000
  const formatCep = useCallback((value: string): string => {
    const clean = value.replace(/\D/g, "").substring(0, 8);
    if (clean.length > 5) {
      return `${clean.substring(0, 5)}-${clean.substring(5)}`;
    }
    return clean;
  }, []);

  return { lookup, loading, error, formatCep };
}
