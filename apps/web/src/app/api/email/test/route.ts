import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const to = body.to as string;

  if (!to) {
    return NextResponse.json({ error: "Campo 'to' (email destino) é obrigatório" }, { status: 400 });
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "465");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({
      success: false,
      error: "SMTP não configurado",
      config: { smtpHost: !!smtpHost, smtpUser: !!smtpUser, smtpPass: !!smtpPass },
    });
  }

  const diagnostics: Record<string, unknown> = {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpFrom,
    secure: smtpPort === 465,
  };

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      debug: true,
      logger: true,
    });

    // Etapa 1: Verificar conexão SMTP
    diagnostics.step = "verify";
    await transporter.verify();
    diagnostics.verifyOk = true;

    // Etapa 2: Enviar email de teste
    diagnostics.step = "send";
    const info = await transporter.sendMail({
      from: `"Somma Imóveis - Teste" <${smtpFrom}>`,
      to,
      subject: "Teste de Email - Somma Imóveis",
      html: `
        <h2>Teste de Email</h2>
        <p>Este é um email de teste do sistema Somma Imóveis.</p>
        <p>Se você recebeu este email, o envio está funcionando corretamente.</p>
        <p><small>Enviado em: ${new Date().toLocaleString("pt-BR")}</small></p>
      `,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      diagnostics,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      responseCode: error.responseCode || null,
      command: error.command || null,
      diagnostics,
    });
  }
}
