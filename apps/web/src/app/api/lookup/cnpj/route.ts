import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cnpj = request.nextUrl.searchParams.get("cnpj");
  if (!cnpj) {
    return NextResponse.json({ error: "CNPJ não informado" }, { status: 400 });
  }

  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }

  // Try BrasilAPI first (no rate limit), fallback to ReceitaWS
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);

    if (res.ok) {
      const d = await res.json();
      // Map BrasilAPI response to ReceitaWS format for compatibility
      return NextResponse.json({
        razao_social: d.razao_social || "",
        nome_fantasia: d.nome_fantasia || "",
        cnpj: d.cnpj || clean,
        logradouro: d.logradouro || "",
        numero: d.numero || "",
        complemento: d.complemento || "",
        bairro: d.bairro || "",
        municipio: d.municipio || "",
        uf: d.uf || "",
        cep: d.cep || "",
        telefone: d.ddd_telefone_1 || "",
        email: d.email || "",
        situacao_cadastral: d.descricao_situacao_cadastral || "",
      });
    }
  } catch {
    // BrasilAPI failed, try ReceitaWS
  }

  // Fallback: ReceitaWS
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${clean}`, {
      headers: { Accept: "application/json" },
    });

    if (res.status === 429) {
      return NextResponse.json({ error: "Limite de consultas atingido. Aguarde 1 minuto." }, { status: 429 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao consultar CNPJ" }, { status: 500 });
  }
}
