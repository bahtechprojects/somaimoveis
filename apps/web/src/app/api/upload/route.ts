import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const contractId = formData.get("contractId") as string;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Apenas arquivos PDF são aceitos" }, { status: 400 });
    }

    // Validate file size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo deve ter no máximo 25MB" }, { status: 400 });
    }

    // Create uploads directory (use /app/public/uploads for Docker volume mount)
    const baseDir = process.env.NODE_ENV === "production" ? "/app/public/uploads" : path.join(process.cwd(), "public", "uploads");
    const uploadsDir = path.join(baseDir, "contracts");
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}-${safeName}`;
    const filePath = path.join(uploadsDir, filename);

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const url = `/api/files/contracts/${filename}`;

    const { prisma } = await import("@/lib/prisma");
    const entityType = (formData.get("entityType") as string) || "CONTRACT";
    const entityId = (formData.get("entityId") as string) || contractId;

    // Create Document record in database
    if (entityId) {
      await prisma.document.create({
        data: {
          name: file.name,
          url,
          mimeType: file.type,
          size: file.size,
          category: "CONTRATO",
          entityType,
          entityId,
        },
      });

      // Also update contract.documentUrl for backwards compatibility
      if (contractId) {
        await prisma.contract.update({
          where: { id: contractId },
          data: { documentUrl: url },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ url, filename }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }
}
