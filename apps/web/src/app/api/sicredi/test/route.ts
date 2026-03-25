import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { isSicrediConfigured, sicrediAuth } from "@/lib/sicredi-client";

export async function GET() {
  return NextResponse.json({
    configured: isSicrediConfigured(),
    sandbox: process.env.SICREDI_API_URL?.includes("sandbox") ?? false,
    cooperativa: process.env.SICREDI_COOPERATIVA ?? null,
    posto: process.env.SICREDI_POSTO ?? null,
    beneficiario: process.env.SICREDI_BENEFICIARIO ?? null,
  });
}

export async function POST() {
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

    const token = await sicrediAuth();

    return NextResponse.json({
      success: true,
      token: token.substring(0, 20) + "...",
      mode: process.env.SICREDI_API_URL?.includes("sandbox") ? "sandbox" : "production",
    });
  } catch (error) {
    console.error("Erro ao testar Sicredi:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao autenticar no Sicredi",
        mode: process.env.SICREDI_API_URL?.includes("sandbox") ? "sandbox" : "production",
      },
      { status: 500 }
    );
  }
}
