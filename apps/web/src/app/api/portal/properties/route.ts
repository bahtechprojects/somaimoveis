import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPortalToken } from "@/lib/portal-auth";

export async function GET(request: NextRequest) {
  const auth = await verifyPortalToken(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Nao autorizado" },
      { status: 401 }
    );
  }

  try {
    const { ownerId } = auth;

    const properties = await prisma.property.findMany({
      where: { ownerId, active: true },
      include: {
        photos: {
          orderBy: { order: "asc" },
          take: 1,
        },
        contracts: {
          where: { status: "ATIVO" },
          select: {
            id: true,
            code: true,
            status: true,
            rentalValue: true,
            tenant: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { title: "asc" },
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("Erro ao buscar imoveis do portal:", error);
    return NextResponse.json(
      { error: "Erro ao buscar imoveis" },
      { status: 500 }
    );
  }
}
