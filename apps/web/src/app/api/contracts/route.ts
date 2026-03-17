import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { tenant: { name: { contains: search } } },
      { property: { title: { contains: search } } },
    ];
  }

  const includeRelations = {
    property: { select: { id: true, title: true } },
    owner: { select: { id: true, name: true } },
    tenant: { select: { id: true, name: true } },
  };

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const contracts = await prisma.contract.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(contracts);
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.contract.count({ where }),
  ]);

  return NextResponse.json({
    data: contracts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const { code, propertyId, ownerId, tenantId, rentalValue, startDate, endDate } = body;
  if (!code || !propertyId || !ownerId || !tenantId || !rentalValue || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Campos obrigatórios: code, propertyId, ownerId, tenantId, rentalValue, startDate, endDate" },
      { status: 400 }
    );
  }
  const contract = await prisma.contract.create({
    data: {
      code, propertyId, ownerId, tenantId,
      rentalValue: parseFloat(rentalValue),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      type: body.type || "LOCACAO",
      status: body.status || "ATIVO",
      adminFeePercent: body.adminFeePercent ? parseFloat(body.adminFeePercent) : 10,
      paymentDay: body.paymentDay ? parseInt(body.paymentDay) : 10,
      guaranteeType: body.guaranteeType || null,
      guaranteeValue: body.guaranteeValue ? parseFloat(body.guaranteeValue) : null,
      guaranteeNotes: body.guaranteeNotes || null,
      adjustmentIndex: body.adjustmentIndex || "IGPM",
      adjustmentMonth: body.adjustmentMonth ? parseInt(body.adjustmentMonth) : null,
      documentUrl: body.documentUrl || null,
      notes: body.notes || null,
    },
    include: {
      property: { select: { id: true, title: true } },
      owner: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(contract, { status: 201 });
}
