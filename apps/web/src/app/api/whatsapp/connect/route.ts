import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const url = process.env.UAZAPI_URL;
    const token = process.env.UAZAPI_TOKEN;

    if (!url || !token) {
      return NextResponse.json(
        { error: "UaZapi não configurado. Verifique UAZAPI_URL e UAZAPI_TOKEN no .env" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const phone = body.phone || "";

    const response = await fetch(`${url}/instance/connect`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify({ phone }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Erro ao conectar instância", details: data },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[WhatsApp Connect] Error:", error);
    return NextResponse.json(
      { error: "Erro ao conectar instância WhatsApp" },
      { status: 500 }
    );
  }
}
