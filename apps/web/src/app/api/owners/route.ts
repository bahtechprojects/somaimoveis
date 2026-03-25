import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { active: true };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { cpfCnpj: { contains: search } },
    ];
  }

  const includeRelations = {
    properties: { select: { id: true } },
    contracts: { where: { status: "ATIVO" }, select: { id: true, rentalValue: true } },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrich = (owners: any[]) =>
    owners.map((owner) => ({
      ...owner,
      propertyCount: owner.properties.length,
      activeContractCount: owner.contracts.length,
      monthlyIncome: owner.contracts.reduce((sum: number, c: { rentalValue: number }) => sum + c.rentalValue, 0),
    }));

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const owners = await prisma.owner.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(enrich(owners));
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [owners, total] = await Promise.all([
    prisma.owner.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.owner.count({ where }),
  ]);

  return NextResponse.json({
    data: enrich(owners),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const { name, cpfCnpj } = body;
  if (!name || !cpfCnpj) {
    return NextResponse.json(
      { error: "Campos obrigatórios: name, cpfCnpj" },
      { status: 400 }
    );
  }
  // Check duplicate CPF/CNPJ
  const existing = await prisma.owner.findUnique({ where: { cpfCnpj } });
  if (existing) {
    return NextResponse.json(
      { error: "Ja existe um proprietario com este CPF/CNPJ" },
      { status: 409 }
    );
  }
  const owner = await prisma.owner.create({
    data: {
      name, cpfCnpj,
      email: body.email || null,
      phone: body.phone || null,
      personType: body.personType || "PF",
      stateRegistration: body.stateRegistration || null,
      street: body.street || null,
      number: body.number || null,
      complement: body.complement || null,
      neighborhood: body.neighborhood || null,
      city: body.city || null,
      state: body.state || null,
      zipCode: body.zipCode || null,
      bankName: body.bankName || null,
      bankAgency: body.bankAgency || null,
      bankAccount: body.bankAccount || null,
      bankPix: body.bankPix || null,
      bankPixType: body.bankPixType || null,
      birthDate: body.birthDate ? new Date(body.birthDate + "T12:00:00") : null,
      rgIssuer: body.rgIssuer || null,
      paymentDay: body.paymentDay ? parseInt(body.paymentDay) : 10,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(owner, { status: 201 });
}
