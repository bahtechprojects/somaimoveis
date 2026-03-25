import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

// ==================================================
// GET /api/notifications/[id] - Detalhe de uma notificação
// ==================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notificação não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(notification);
  } catch (error) {
    console.error("Erro ao buscar notificação:", error);
    return NextResponse.json(
      { error: "Erro ao buscar notificação" },
      { status: 500 }
    );
  }
}

// ==================================================
// DELETE /api/notifications/[id] - Cancelar/excluir notificação
// ==================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notificação não encontrada" },
        { status: 404 }
      );
    }

    // Se esta pendente, cancelar em vez de deletar
    if (notification.status === "PENDENTE") {
      const updated = await prisma.notification.update({
        where: { id },
        data: { status: "CANCELADO" },
      });
      return NextResponse.json(updated);
    }

    // Caso contrario, deletar o registro
    await prisma.notification.delete({ where: { id } });

    return NextResponse.json({ message: "Notificação excluída com sucesso" });
  } catch (error) {
    console.error("Erro ao excluir notificação:", error);
    return NextResponse.json(
      { error: "Erro ao excluir notificação" },
      { status: 500 }
    );
  }
}
