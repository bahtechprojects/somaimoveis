import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import archiver from "archiver";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { PassThrough } from "stream";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const entityType = request.nextUrl.searchParams.get("entityType") || "CONTRACT";

    // Get all documents of the specified type
    const documents = await prisma.document.findMany({
      where: { entityType },
      orderBy: { createdAt: "desc" },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: "Nenhum documento encontrado" }, { status: 404 });
    }

    // Create ZIP archive
    const archive = archiver("zip", { zlib: { level: 5 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    let addedFiles = 0;
    for (const doc of documents) {
      // Documents URL is like /uploads/contracts/filename.pdf
      const filePath = path.join(process.cwd(), "public", doc.url);
      if (existsSync(filePath)) {
        archive.append(createReadStream(filePath), { name: doc.name });
        addedFiles++;
      }
    }

    if (addedFiles === 0) {
      return NextResponse.json({ error: "Nenhum arquivo PDF encontrado no servidor" }, { status: 404 });
    }

    archive.finalize();

    // Convert stream to ReadableStream for Next.js
    const readable = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk) => controller.enqueue(chunk));
        passthrough.on("end", () => controller.close());
        passthrough.on("error", (err) => controller.error(err));
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="documentos-${entityType.toLowerCase()}.zip"`,
      },
    });
  } catch (error) {
    console.error("Download all error:", error);
    return NextResponse.json({ error: "Erro ao gerar ZIP" }, { status: 500 });
  }
}
