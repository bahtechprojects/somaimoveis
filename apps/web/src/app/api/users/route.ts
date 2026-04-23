import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const userRole = (session.user as any).role || "";
  // Suporte a multi-role: o user pode ter "ADMIN,CORRETOR,..."
  if (!userRole.split(",").map((r: string) => r.trim().toUpperCase()).includes("ADMIN")) {
    return NextResponse.json(
      { error: "Acesso restrito a administradores" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "";
  const active = searchParams.get("active");

  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
    ];
  }

  // Filtro de role: usar contains para casar multi-role (ex: "CORRETOR" achar "CORRETOR,FINANCEIRO")
  if (role) {
    where.role = { contains: role };
  }

  if (active !== null && active !== "") {
    where.active = active === "true";
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      phone: true,
      avatarUrl: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const userRole = (session.user as any).role || "";
  if (!userRole.split(",").map((r: string) => r.trim().toUpperCase()).includes("ADMIN")) {
    return NextResponse.json(
      { error: "Acesso restrito a administradores" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, email, password, role, phone, permissions } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Nome, email e senha são obrigatórios" },
      { status: 400 }
    );
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Este email ja esta em uso" },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // permissions: aceita array de strings, salva como JSON
  let permissionsJson: string | null = null;
  if (Array.isArray(permissions) && permissions.length > 0) {
    permissionsJson = JSON.stringify(permissions);
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || "CORRETOR",
      permissions: permissionsJson,
      phone: phone || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      phone: true,
      avatarUrl: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
