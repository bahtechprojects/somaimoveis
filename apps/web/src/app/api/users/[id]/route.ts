import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
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

  if (!user) {
    return NextResponse.json(
      { error: "Usuario nao encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json(user);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const currentUserId = (session.user as any).id;
  const body = await request.json();
  const { name, email, role, phone, active, password } = body;

  // Cannot change own role
  if (id === currentUserId && role !== undefined) {
    const currentUser = await prisma.user.findUnique({ where: { id } });
    if (currentUser && role !== currentUser.role) {
      return NextResponse.json(
        { error: "Voce nao pode alterar seu proprio cargo" },
        { status: 400 }
      );
    }
  }

  // Check email uniqueness if changed
  if (email) {
    const existing = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Este email ja esta em uso por outro usuario" },
        { status: 409 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (phone !== undefined) updateData.phone = phone;
  if (active !== undefined) updateData.active = active;
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
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

  return NextResponse.json(updatedUser);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const currentUserId = (session.user as any).id;

  // Cannot deactivate yourself
  if (id === currentUserId) {
    return NextResponse.json(
      { error: "Voce nao pode desativar sua propria conta" },
      { status: 400 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { active: false },
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

  return NextResponse.json(updatedUser);
}
