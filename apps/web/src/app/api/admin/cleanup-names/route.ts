import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

function truncateName(name: string): string {
  let n = name;
  // Remove "Alteração do LOCATÁRIO..." preamble - extract the actual new tenant name
  const altMatch = n.match(/(?:será|sera|será\s*a?\s*)\s*(?:SANTA CRUZ DO SUL\s*[-–]\s*)?(.+)/i);
  if (n.toLowerCase().startsWith("alteração do locat") || n.toLowerCase().startsWith("alteracao do locat")) {
    // Try to extract the new entity name after "será" or use as-is but truncated
    if (altMatch) {
      n = altMatch[1];
    }
  }
  return n
    .split(/,\s*(?:brasileir[oa]|ambos|inscrit|portador|nascid|casad|solteir|divorci|viuv|viúv|natural|residente|pessoa|empresa|com sede|representad|maior|menor|anteriormente)/i)[0]
    .split(/\s+(?:CPF|RG\s)/i)[0]
    .split(/,\s*(?:deixa de fazer|a partir da)/i)[0]
    .trim()
    .substring(0, 200);
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let fixed = 0;

  // Fix tenant names
  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const clean = truncateName(t.name);
    if (clean !== t.name) {
      await prisma.tenant.update({ where: { id: t.id }, data: { name: clean } });
      fixed++;
    }
  }

  // Fix owner names
  const owners = await prisma.owner.findMany();
  for (const o of owners) {
    const clean = truncateName(o.name);
    if (clean !== o.name) {
      await prisma.owner.update({ where: { id: o.id }, data: { name: clean } });
      fixed++;
    }
  }

  return NextResponse.json({ message: `${fixed} nomes corrigidos` });
}
