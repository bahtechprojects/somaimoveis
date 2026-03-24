import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

function truncateName(name: string): string {
  let n = name;
  // If name starts with "Alteração do LOCATÁRIO..." it's a contract amendment text, not a real name
  if (n.toLowerCase().startsWith("alteração do locat") || n.toLowerCase().startsWith("alteracao do locat")) {
    // Try to extract the new entity name after "será"
    const seraMatch = n.match(/(?:será|sera)[^A-Z]*([A-ZÀÁÂÃÉÊÍÓÔÕÚÇ][A-ZÀÁÂÃÉÊÍÓÔÕÚÇa-zàáâãéêíóôõúç\s\-–&.]+(?:LTDA|ME|EPP|EIRELI|S\.?A\.?|S\/A)?)/);
    if (seraMatch) {
      n = seraMatch[1].trim();
    } else {
      // Fallback: just use "Aditivo - CPF"
      const cpfMatch = n.match(/\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/);
      n = cpfMatch ? `Aditivo - ${cpfMatch[0]}` : n.substring(0, 80);
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
