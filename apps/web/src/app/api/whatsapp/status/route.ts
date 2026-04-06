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

    // UaZapi response: { instance: { status, name, owner, profileName, ... }, status: { connected, loggedIn, ... } }
    const instance = data.instance || {};
    const statusObj = data.status || {};

    const isConnected =
      statusObj.connected === true ||
      statusObj.loggedIn === true ||
      instance.status === "connected";

    return NextResponse.json({
      configured: true,
      connected: isConnected,
      status: instance.status || statusObj.connected ? "connected" : "disconnected",
      phone: instance.owner || null,
      name: instance.profileName || instance.name || null,
      profilePic: instance.profilePicUrl || null,
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
