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
