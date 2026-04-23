import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPortalToken } from "@/lib/portal-auth";

/**
 * GET /api/portal/me
 * Retorna dados do proprietario logado e se ja tem senha definida.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyPortalToken(request);
  if (!auth) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const owner = await prisma.owner.findUnique({
    where: { id: auth.ownerId },
    select: {
      id: true,
      name: true,
      email: true,
      cpfCnpj: true,
      personType: true,
      phone: true,
      portalActive: true,
      portalPassword: true,
    },
  });

  if (!owner) {
    return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: owner.id,
    name: owner.name,
    email: owner.email,
    cpfCnpj: owner.cpfCnpj,
    personType: owner.personType,
    phone: owner.phone,
    portalActive: owner.portalActive,
    hasPassword: !!owner.portalPassword,
  });
}
