import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { sendWhatsAppMessage, isUazapiConfigured } from "@/lib/whatsapp-sender";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "Informe o numero de telefone" },
        { status: 400 }
      );
    }

    const configured = isUazapiConfigured();

    const result = await sendWhatsAppMessage({
      to: phone,
      message: "Mensagem de teste do Somma - Sistema de Gestao Imobiliaria. Se voce recebeu esta mensagem, a integracao WhatsApp esta funcionando corretamente!",
    });

    return NextResponse.json({
      ...result,
      mode: configured ? "uazapi" : "mock",
    });
  } catch (error) {
    console.error("Erro ao testar WhatsApp:", error);
    return NextResponse.json(
      { error: "Erro ao enviar mensagem de teste" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  return NextResponse.json({
    configured: isUazapiConfigured(),
    url: process.env.UAZAPI_URL ? "configurado" : "nao configurado",
    token: process.env.UAZAPI_TOKEN ? "configurado" : "nao configurado",
  });
}
