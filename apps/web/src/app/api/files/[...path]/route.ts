import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;

    // Security: reject any segment containing ".." to prevent directory traversal
    if (segments.some((seg) => seg.includes(".."))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const relativePath = segments.join("/");

    // Try multiple possible paths (standalone vs dev)
    const possiblePaths = [
      path.join(process.cwd(), "public", "uploads", relativePath),
      path.join("/app", "public", "uploads", relativePath),
      path.join("/app/public/uploads", relativePath),
    ];

    let resolvedPath: string | null = null;
    for (const p of possiblePaths) {
      try {
        await stat(p);
        resolvedPath = p;
        break;
      } catch {
        continue;
      }
    }

    if (!resolvedPath) {
      console.error("[Files] Not found in any path:", possiblePaths[0]);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const fileBuffer = await readFile(resolvedPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
