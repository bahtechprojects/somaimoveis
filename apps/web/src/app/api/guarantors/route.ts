import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const available = searchParams.get("available");
  const excludeContractId = searchParams.get("excludeContractId");

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { cpfCnpj: { contains: search } },
      { email: { contains: search } },
    ];
  }
  // Filter only guarantors not linked to any active contract
  if (available === "true") {
    where.contracts = excludeContractId
      ? { none: { contract: { status: "ATIVO", id: { not: excludeContractId } } } }
      : { none: { contract: { status: "ATIVO" } } };
  }

  const includeRelations = {
    contracts: {
      select: {
        contract: { select: { id: true, code: true, status: true } },
      },
    },
  };

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const guarantors = await prisma.guarantor.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(guarantors);
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [guarantors, total] = await Promise.all([
    prisma.guarantor.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.guarantor.count({ where }),
  ]);

  return NextResponse.json({
    data: guarantors,
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

  // Check duplicate CPF/CNPJ - return existing instead of error
  const existing = await prisma.guarantor.findUnique({ where: { cpfCnpj } });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const guarantor = await prisma.guarantor.create({
    data: {
      name,
      cpfCnpj,
      personType: body.personType || "PF",
      stateRegistration: body.stateRegistration || null,
      email: body.email || null,
      phone: body.phone || null,
      phone2: body.phone2 || null,
      email2: body.email2 || null,
      rgNumber: body.rgNumber || null,
      rgIssuer: body.rgIssuer || null,
      birthDate: body.birthDate ? new Date(body.birthDate + "T12:00:00") : null,
      maritalStatus: body.maritalStatus || null,
      profession: body.profession || null,
      street: body.street || null,
      number: body.number || null,
      complement: body.complement || null,
      neighborhood: body.neighborhood || null,
      city: body.city || null,
      state: body.state || null,
      zipCode: body.zipCode || null,
      propertyRegistration: body.propertyRegistration || null,
      occupation: body.occupation || null,
      monthlyIncome: body.monthlyIncome ? parseFloat(body.monthlyIncome) : null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(guarantor, { status: 201 });
}
