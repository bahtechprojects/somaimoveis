import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

interface BatchResult {
  filename: string;
  status: "success" | "error";
  documentId?: string;
  contractId?: string;
  contractCode?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const autoMatch = formData.get("autoMatch") === "true";
    const category = (formData.get("category") as string) || "CONTRATO";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Create uploads directory
    const uploadsDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "contracts"
    );
    await mkdir(uploadsDir, { recursive: true });

    // Fetch all contracts for auto-matching if enabled
    let contracts: { id: string; code: string }[] = [];
    if (autoMatch) {
      contracts = await prisma.contract.findMany({
        select: { id: true, code: true },
      });
    }

    const results: BatchResult[] = [];

    for (const file of files) {
      const result: BatchResult = {
        filename: file.name,
        status: "success",
      };

      try {
        // Validate file type
        if (file.type !== "application/pdf") {
          result.status = "error";
          result.error = "Tipo de arquivo invalido. Apenas PDF e aceito.";
          results.push(result);
          continue;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          result.status = "error";
          result.error = "Arquivo excede o limite de 10MB.";
          results.push(result);
          continue;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filename = `${timestamp}-${safeName}`;
        const filePath = path.join(uploadsDir, filename);

        // Write file to disk
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filePath, buffer);

        const url = `/uploads/contracts/${filename}`;

        // Auto-match: try to find a contract code in the filename
        let matchedContract: { id: string; code: string } | null = null;
        if (autoMatch && contracts.length > 0) {
          const fileNameUpper = file.name.toUpperCase();
          // Try to match contract codes like CTR-001, CTR-002, etc.
          for (const contract of contracts) {
            if (fileNameUpper.includes(contract.code.toUpperCase())) {
              matchedContract = contract;
              break;
            }
          }
        }

        // Create Document record in database
        const document = await prisma.document.create({
          data: {
            name: file.name,
            url,
            mimeType: file.type,
            size: file.size,
            category,
            entityType: matchedContract ? "CONTRACT" : null,
            entityId: matchedContract ? matchedContract.id : null,
          },
        });

        result.documentId = document.id;

        // If matched, also update the contract's documentUrl
        if (matchedContract) {
          await prisma.contract.update({
            where: { id: matchedContract.id },
            data: { documentUrl: url },
          });
          result.contractId = matchedContract.id;
          result.contractCode = matchedContract.code;
        }
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        result.status = "error";
        result.error = "Erro interno ao processar o arquivo.";
      }

      results.push(result);
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          success: successCount,
          errors: errorCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Batch upload error:", error);
    return NextResponse.json(
      { error: "Erro ao processar upload em lote" },
      { status: 500 }
    );
  }
}
