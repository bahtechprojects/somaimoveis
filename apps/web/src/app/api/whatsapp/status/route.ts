import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const url = process.env.UAZAPI_URL;
    const token = process.env.UAZAPI_TOKEN;

    if (!url || !token) {
      return NextResponse.json({
        configured: false,
        connected: false,
        status: "not_configured",
        message: "UaZapi não configurado",
      });
    }

    const response = await fetch(`${url}/instance/status`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "token": token,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        configured: true,
        connected: false,
        status: "error",
        message: data.message || "Erro ao verificar status",
        details: data,
      });
    }

    // UaZapi returns different status formats - normalize
    const isConnected =
      data.connected === true ||
      data.status === "CONNECTED" ||
      data.state === "CONNECTED" ||
      data.state === "open";

    return NextResponse.json({
      configured: true,
      connected: isConnected,
      status: data.status || data.state || "unknown",
      phone: data.phone || data.number || null,
      name: data.name || data.pushname || null,
      details: data,
    });
  } catch (error) {
    console.error("[WhatsApp Status] Error:", error);
    return NextResponse.json({
      configured: true,
      connected: false,
      status: "error",
      message: "Erro ao verificar status da instância",
    });
  }
}
