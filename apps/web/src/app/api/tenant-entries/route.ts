import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const contractId = searchParams.get("contractId");

  const where: Record<string, unknown> = {};
  if (tenantId) where.tenantId = tenantId;
  if (type) where.type = type;
  if (status && status !== "all") where.status = status;
  if (contractId) where.contractId = contractId;

  const includeRelations = {
    tenant: { select: { id: true, name: true } },
  };

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const entries = await prisma.tenantEntry.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries);
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    prisma.tenantEntry.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tenantEntry.count({ where }),
  ]);

  return NextResponse.json({
    data: entries,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const { type, category, description, value, tenantId } = body;
  if (!type || !category || !description || !value || !tenantId) {
    return NextResponse.json(
      { error: "Campos obrigatórios: type, category, description, value, tenantId" },
      { status: 400 }
    );
  }

  const validTypes = ["DEBITO", "CREDITO"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Tipo inválido. Use: DEBITO ou CREDITO" },
      { status: 400 }
    );
  }

  const validCategories = [
    "ALUGUEL", "CONDOMINIO", "IPTU", "AGUA", "LUZ", "GAS",
    "MULTA", "REPARO", "DESCONTO", "ACORDO", "OUTROS",
  ];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `Categoria inválida. Use: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  const entry = await prisma.tenantEntry.create({
    data: {
      type,
      category,
      description,
      value: parseFloat(value),
      tenantId,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      contractId: body.contractId || null,
      propertyId: body.propertyId || null,
      status: body.status || "PENDENTE",
      notes: body.notes || null,
    },
    include: {
      tenant: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
