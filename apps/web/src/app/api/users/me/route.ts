import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Usuario nao encontrado" },
      { status: 404 }
    );
  }

  const { password: _, ...userWithoutPassword } = user;

  return NextResponse.json(userWithoutPassword);
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const body = await request.json();
  const { name, email, phone } = body;

  // Validate email uniqueness if changed
  if (email) {
    const existing = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
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
  if (phone !== undefined) updateData.phone = phone;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  const { password: _, ...userWithoutPassword } = updatedUser;

  return NextResponse.json(userWithoutPassword);
}
