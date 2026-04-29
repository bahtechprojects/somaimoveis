import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit-logs
 * Filtros: ?entity=Contract&action=CREATE&userId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *          &search=texto (busca em entityCode/entityName)
 *          &page=1&limit=50
 *
 * Apenas ADMIN.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const where: Record<string, unknown> = {};
    if (entity && entity !== "all") where.entity = entity;
    if (action && action !== "all") where.action = action;
    if (userId && userId !== "all") where.userId = userId;
    if (search) {
      where.OR = [
        { entityCode: { contains: search } },
        { entityName: { contains: search } },
        { entityId: { contains: search } },
      ];
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(`${from}T00:00:00`);
      if (to) dateFilter.lte = new Date(`${to}T23:59:59`);
      where.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Parse JSON fields
    const data = logs.map((log) => ({
      ...log,
      changes: log.changes ? safeJsonParse(log.changes) : null,
      metadata: log.metadata ? safeJsonParse(log.metadata) : null,
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("[Audit Logs GET]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar auditoria" },
      { status: 500 }
    );
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
