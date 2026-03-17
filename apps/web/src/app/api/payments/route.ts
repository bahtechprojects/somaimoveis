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
    ];
  }

  const includeRelations = {
    contract: { include: { property: { select: { title: true } } } },
    tenant: { select: { id: true, name: true } },
    owner: { select: { id: true, name: true } },
  };

  const pageParam = searchParams.get("page");
  if (!pageParam) {
    // Legacy: return all as array
    const payments = await prisma.payment.findMany({
      where,
      include: includeRelations,
      orderBy: { dueDate: "desc" },
    });
    return NextResponse.json(payments);
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: includeRelations,
      orderBy: { dueDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return NextResponse.json({
    data: payments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const { contractId, tenantId, ownerId, value, dueDate } = body;
  if (!contractId || !tenantId || !ownerId || !value || !dueDate) {
    return NextResponse.json(
      { error: "Campos obrigatórios: contractId, tenantId, ownerId, value, dueDate" },
      { status: 400 }
    );
  }
  // Auto-generate code if not provided
  let code = body.code;
  if (!code) {
    const lastPayment = await prisma.payment.findFirst({
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let nextNumber = 1;
    if (lastPayment?.code) {
      const match = lastPayment.code.match(/PAG-(\d+)/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }
    code = `PAG-${String(nextNumber).padStart(3, "0")}`;
  }

  const payment = await prisma.payment.create({
    data: {
      code, contractId, tenantId, ownerId,
      value: parseFloat(value),
      dueDate: new Date(dueDate),
      status: body.status || "PENDENTE",
      description: body.description || null,
      paymentMethod: body.paymentMethod || null,
      paidValue: body.paidValue ? parseFloat(body.paidValue) : null,
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
      fineValue: body.fineValue ? parseFloat(body.fineValue) : null,
      interestValue: body.interestValue ? parseFloat(body.interestValue) : null,
      discountValue: body.discountValue ? parseFloat(body.discountValue) : null,
      splitOwnerValue: body.splitOwnerValue ? parseFloat(body.splitOwnerValue) : null,
      splitAdminValue: body.splitAdminValue ? parseFloat(body.splitAdminValue) : null,
      notes: body.notes || null,
    },
    include: {
      tenant: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(payment, { status: 201 });
}
