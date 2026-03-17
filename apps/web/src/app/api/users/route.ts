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

  if ((session.user as any).role !== "ADMIN") {
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

  if (role) {
    where.role = role;
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

  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json(
      { error: "Acesso restrito a administradores" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, email, password, role, phone } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Nome, email e senha sao obrigatorios" },
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

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || "CORRETOR",
      phone: phone || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      avatarUrl: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
