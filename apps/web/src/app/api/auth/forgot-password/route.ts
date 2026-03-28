import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomInt } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const rl = checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (user) {
      // Invalidate any existing tokens for this email
      await prisma.passwordResetToken.updateMany({
        where: { email: user.email, used: false },
        data: { used: true },
      });

      // Generate 6-digit code
      const code = randomInt(100000, 1000000).toString();

      // Store token with 15min expiry
      await prisma.passwordResetToken.create({
        data: {
          email: user.email,
          token: code,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          used: false,
        },
      });

      // Mock: log to console (replace with email service later)
      console.log(`[Reset] Codigo de recuperacao para ${email}: ${code}`);
    }

    // Always return success (don't leak user existence)
    return NextResponse.json({
      message: "Se o email existir, enviaremos um código de recuperação.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
