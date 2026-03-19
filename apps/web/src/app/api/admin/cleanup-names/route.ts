import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

function truncateName(name: string): string {
  return name
    .split(/,\s*(?:brasileir[oa]|ambos|inscrit|portador|nascid|casad|solteir|divorci|viuv|viúv|natural|residente|pessoa|empresa|com sede|representad|maior|menor)/i)[0]
    .split(/\s+(?:CPF|RG\s)/i)[0]
    .replace(/Alteração do LOCAT[ÁA]RIO.*?(?:será|sera)\s*/i, "")
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
