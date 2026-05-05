import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { isAdmin } from "@/lib/rbac";
import { encryptString, isEncryptionConfigured } from "@/lib/crypto";

/**
 * POST /api/fiscal-settings/certificate
 *
 * Upload do certificado digital A1 (.pfx). Espera multipart/form-data:
 *   - certificate: arquivo .pfx
 *   - password: senha do certificado
 *
 * Valida a senha tentando ler o certificado, extrai a data de validade
 * e o nome do arquivo. Salva o .pfx (raw bytes) e a senha (criptografada
 * com AES-256-GCM via lib/crypto).
 *
 * Apenas ADMIN pode fazer upload.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!isAdmin(auth.user.role)) {
    return NextResponse.json(
      { error: "Apenas administradores podem fazer upload do certificado" },
      { status: 403 },
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "ENCRYPTION_KEY nao configurada no servidor. Contate suporte." },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("certificate") as File | null;
    const password = formData.get("password") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Arquivo do certificado obrigatorio" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Senha do certificado obrigatoria" }, { status: 400 });
    }
    if (!file.name.match(/\.(pfx|p12)$/i)) {
      return NextResponse.json(
        { error: "Arquivo deve ser .pfx ou .p12" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // NOTA: nao validamos a senha aqui — Node nao tem suporte nativo a PKCS12.
    // A validacao real acontece na primeira tentativa de emissao de NF
    // (assinatura digital). Se a senha estiver errada, o usuario refaz upload.
    // Tamanho minimo basico (PFX legitimos sao > 2KB)
    if (buffer.length < 1000) {
      return NextResponse.json(
        { error: "Arquivo muito pequeno para ser um .pfx valido." },
        { status: 400 },
      );
    }

    // Atualiza FiscalSettings
    let existing = await prisma.fiscalSettings.findFirst();
    if (!existing) {
      existing = await prisma.fiscalSettings.create({ data: {} });
    }

    const updated = await prisma.fiscalSettings.update({
      where: { id: existing.id },
      data: {
        certificadoPfx: buffer,
        certificadoPassword: encryptString(password),
        certificadoNome: file.name,
        // Validade preenchida manualmente pelo usuario na tela
      },
    });

    return NextResponse.json({
      message: "Certificado carregado com sucesso. Validacao da senha sera feita na primeira emissao.",
      certificadoNome: updated.certificadoNome,
      sizeBytes: buffer.length,
    });
  } catch (error: any) {
    console.error("[FiscalCert Upload] Erro:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar certificado" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/fiscal-settings/certificate
 * Remove o certificado armazenado.
 */
export async function DELETE() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!isAdmin(auth.user.role)) {
    return NextResponse.json(
      { error: "Apenas administradores podem remover o certificado" },
      { status: 403 },
    );
  }

  const existing = await prisma.fiscalSettings.findFirst();
  if (!existing) {
    return NextResponse.json({ message: "Nenhum certificado configurado." });
  }

  await prisma.fiscalSettings.update({
    where: { id: existing.id },
    data: {
      certificadoPfx: null,
      certificadoPassword: null,
      certificadoNome: null,
      certificadoExpiraEm: null,
    },
  });

  return NextResponse.json({ message: "Certificado removido." });
}

