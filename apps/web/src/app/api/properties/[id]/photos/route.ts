import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { requireAuth, isAuthError } from "@/lib/api-auth";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json(
        { error: "Imovel nao encontrado" },
        { status: 404 }
      );
    }

    const photos = await prisma.propertyPhoto.findMany({
      where: { propertyId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(photos);
  } catch (error) {
    console.error("Erro ao buscar fotos:", error);
    return NextResponse.json(
      { error: "Erro ao buscar fotos do imovel" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json(
        { error: "Imovel nao encontrado" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("photos") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma foto enviada" },
        { status: 400 }
      );
    }

    // Validate all files before processing
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            error: `Tipo de arquivo nao permitido: ${file.name}. Apenas JPEG, PNG e WebP sao aceitos.`,
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `Arquivo muito grande: ${file.name}. Tamanho maximo: 25MB.`,
          },
          { status: 400 }
        );
      }
    }

    // Create upload directory
    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "properties",
      id
    );
    await mkdir(uploadDir, { recursive: true });

    // Get current max order for this property's photos
    const lastPhoto = await prisma.propertyPhoto.findFirst({
      where: { propertyId: id },
      orderBy: { order: "desc" },
    });
    let currentOrder = lastPhoto ? lastPhoto.order + 1 : 0;

    const createdPhotos = [];

    for (const file of files) {
      const timestamp = Date.now();
      const extension = file.name.split(".").pop() || "jpg";
      const fileName = `${timestamp}-${Math.random().toString(36).substring(2, 8)}.${extension}`;
      const filePath = path.join(uploadDir, fileName);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // Create database record
      const photo = await prisma.propertyPhoto.create({
        data: {
          url: `/uploads/properties/${id}/${fileName}`,
          caption: null,
          order: currentOrder,
          propertyId: id,
        },
      });

      createdPhotos.push(photo);
      currentOrder++;
    }

    return NextResponse.json(createdPhotos, { status: 201 });
  } catch (error) {
    console.error("Erro ao fazer upload de fotos:", error);
    return NextResponse.json(
      { error: "Erro ao fazer upload das fotos" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;
    const body = await request.json();
    const { photoId } = body;

    if (!photoId) {
      return NextResponse.json(
        { error: "ID da foto e obrigatorio" },
        { status: 400 }
      );
    }

    // Find the photo and verify it belongs to this property
    const photo = await prisma.propertyPhoto.findFirst({
      where: { id: photoId, propertyId: id },
    });

    if (!photo) {
      return NextResponse.json(
        { error: "Foto nao encontrada" },
        { status: 404 }
      );
    }

    // Delete the file from disk
    try {
      const filePath = path.join(process.cwd(), "public", photo.url);
      await unlink(filePath);
    } catch (fileError) {
      // File may not exist on disk, continue with database deletion
      console.warn("Arquivo nao encontrado no disco:", photo.url);
    }

    // Delete the database record
    await prisma.propertyPhoto.delete({
      where: { id: photoId },
    });

    return NextResponse.json({ message: "Foto excluida com sucesso" });
  } catch (error) {
    console.error("Erro ao excluir foto:", error);
    return NextResponse.json(
      { error: "Erro ao excluir foto" },
      { status: 500 }
    );
  }
}
