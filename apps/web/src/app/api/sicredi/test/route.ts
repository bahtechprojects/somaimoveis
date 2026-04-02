import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { isSicrediConfigured, sicrediAuth } from "@/lib/sicredi-client";

const SICREDI_API_URL = process.env.SICREDI_API_URL || "https://api-parceiro.sicredi.com.br";
const SICREDI_API_KEY = process.env.SICREDI_API_KEY || "";
const SICREDI_COOPERATIVA = process.env.SICREDI_COOPERATIVA || "";
const SICREDI_POSTO = process.env.SICREDI_POSTO || "";
const SICREDI_BENEFICIARIO = process.env.SICREDI_BENEFICIARIO || "";
const SICREDI_SANDBOX = process.env.SICREDI_SANDBOX === "true";
const PATH_PREFIX = SICREDI_SANDBOX ? "/sb" : "";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    configured: isSicrediConfigured(),
    sandbox: SICREDI_SANDBOX,
    cooperativa: SICREDI_COOPERATIVA || null,
    posto: SICREDI_POSTO || null,
    beneficiario: SICREDI_BENEFICIARIO || null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const configured = isSicrediConfigured();

    if (!configured) {
      return NextResponse.json(
        {
          success: false,
          error: "Sicredi nao configurado. Verifique as variaveis: SICREDI_API_URL, SICREDI_API_KEY, SICREDI_USERNAME, SICREDI_PASSWORD",
        },
        { status: 400 }
      );
    }

    // Etapa 1: Autenticacao
    const token = await sicrediAuth();

    // Verificar se query param ?boleto=true para testar criacao
    const { searchParams } = new URL(request.url);
    const testBoleto = searchParams.get("boleto") === "true";

    if (!testBoleto) {
      return NextResponse.json({
        success: true,
        token: token.substring(0, 20) + "...",
        mode: SICREDI_SANDBOX ? "sandbox" : "production",
        hint: "Adicione ?boleto=true para testar criacao de boleto com dados ficticios",
      });
    }

    // Etapa 2: Testar criacao de boleto com dados minimos
    const url = `${SICREDI_API_URL}${PATH_PREFIX}/cobranca/boleto/v1/boletos`;

    // Data de vencimento = 10 dias no futuro
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const boletoBody = {
      codigoBeneficiario: SICREDI_BENEFICIARIO,
      tipoCobranca: "HIBRIDO",
      especieDocumento: "DUPLICATA_MERCANTIL_INDICACAO",
      valor: 100.00,
      dataVencimento: dueDateStr,
      seuNumero: "TESTE-001",
      pagador: {
        tipoPessoa: "PESSOA_FISICA",
        documento: "00000000000",
        nome: "TESTE DIAGNOSTICO",
        endereco: "Rua Teste 123",
        cidade: "Santa Cruz do Sul",
        uf: "RS",
        cep: "96810000",
      },
      beneficiarioFinal: {
        tipoPessoa: "PESSOA_JURIDICA",
        documento: "40528068000162",
        nome: "SOMMA IMOVEIS",
        logradouro: "Rua Tenente Coronel Brito 138",
        cidade: "Santa Cruz do Sul",
        uf: "RS",
        cep: "96810202",
      },
    };

    console.log(`[Sicredi Test] Testando criacao de boleto em ${url}`);
    console.log(`[Sicredi Test] Payload:`, JSON.stringify(boletoBody, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-api-key": SICREDI_API_KEY,
        "Content-Type": "application/json",
        "cooperativa": SICREDI_COOPERATIVA,
        "posto": SICREDI_POSTO,
      },
      body: JSON.stringify(boletoBody),
    });

    const contentType = response.headers.get("content-type") || "";
    let responseBody: unknown;

    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      const text = await response.text();
      responseBody = { rawHtml: text.slice(0, 500) };
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      url,
      headers: {
        cooperativa: SICREDI_COOPERATIVA,
        posto: SICREDI_POSTO,
        beneficiario: SICREDI_BENEFICIARIO,
      },
      payload: boletoBody,
      response: responseBody,
    });
  } catch (error) {
    console.error("Erro ao testar Sicredi:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao autenticar no Sicredi",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
