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

    // Create uploads directory
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "contracts");
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

    const url = `/uploads/contracts/${filename}`;

    // If contractId provided, update the contract
    if (contractId) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.contract.update({
        where: { id: contractId },
        data: { documentUrl: url },
      });
    }

    return NextResponse.json({ url, filename }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }
}
