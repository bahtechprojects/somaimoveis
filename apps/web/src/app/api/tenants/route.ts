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
    contracts: {
      where: { status: "ATIVO" },
      include: { property: { select: { title: true } } },
      take: 1,
    },
    payments: {
      orderBy: { dueDate: "desc" as const },
      take: 1,
      select: { status: true },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrich = (tenants: any[]) =>
    tenants.map((tenant) => ({
      ...tenant,
      currentProperty: tenant.contracts[0]?.property?.title || null,
      contractEndDate: tenant.contracts[0]
        ? (tenant.contracts[0] as { endDate: Date }).endDate
        : null,
      paymentStatus: tenant.payments[0]?.status || "SEM_COBRANCA",
    }));

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const tenants = await prisma.tenant.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(enrich(tenants));
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: includeRelations,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  return NextResponse.json({
    data: enrich(tenants),
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
  const existing = await prisma.tenant.findUnique({ where: { cpfCnpj } });
  if (existing) {
    return NextResponse.json(
      { error: "Ja existe um locatario com este CPF/CNPJ" },
      { status: 409 }
    );
  }
  const tenant = await prisma.tenant.create({
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
      rgNumber: body.rgNumber || null,
      occupation: body.occupation || null,
      monthlyIncome: body.monthlyIncome ? parseFloat(body.monthlyIncome) : null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(tenant, { status: 201 });
}
