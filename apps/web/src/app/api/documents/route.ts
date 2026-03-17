import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    const where: Record<string, unknown> = {};

    if (category) {
      where.category = category;
    }
    if (entityType) {
      where.entityType = entityType;
    }
    if (entityId) {
      where.entityId = entityId;
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Erro ao buscar documentos" },
      { status: 500 }
    );
  }
}
