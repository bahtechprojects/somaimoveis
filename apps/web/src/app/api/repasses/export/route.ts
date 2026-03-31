import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const ownerIds = searchParams.get("ownerIds"); // comma-separated
  const format = searchParams.get("format") || "csv"; // csv or json

  const where: Record<string, unknown> = {
    type: "CREDITO",
    category: "REPASSE",
    status: "PENDENTE",
  };

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.dueDate = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  }

  if (ownerIds) {
    where.ownerId = { in: ownerIds.split(",") };
  }

  const entries = await prisma.ownerEntry.findMany({
    where,
    include: {
      owner: {
        select: {
          name: true,
          cpfCnpj: true,
          bankName: true,
          bankAgency: true,
          bankAccount: true,
          bankPix: true,
          bankPixType: true,
          thirdPartyName: true,
          thirdPartyDocument: true,
          thirdPartyBank: true,
          thirdPartyAgency: true,
          thirdPartyAccount: true,
          thirdPartyPixKeyType: true,
          thirdPartyPix: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Group by owner and sum values
  const grouped: Record<
    string,
    {
      nome: string;
      documento: string;
      banco: string;
      agencia: string;
      conta: string;
      chavePix: string;
      tipoChavePix: string;
      valor: number;
      descricao: string;
      entryIds: string[];
    }
  > = {};

  for (const entry of entries) {
    const oid = entry.ownerId;
    if (!grouped[oid]) {
      // Use third-party data if available, otherwise owner data
      const o = entry.owner;
      const useThirdParty = !!o.thirdPartyName;
      grouped[oid] = {
        nome: useThirdParty ? o.thirdPartyName! : o.name,
        documento: useThirdParty
          ? o.thirdPartyDocument || o.cpfCnpj
          : o.cpfCnpj,
        banco: useThirdParty ? o.thirdPartyBank || "" : o.bankName || "",
        agencia: useThirdParty
          ? o.thirdPartyAgency || ""
          : o.bankAgency || "",
        conta: useThirdParty
          ? o.thirdPartyAccount || ""
          : o.bankAccount || "",
        chavePix: useThirdParty ? o.thirdPartyPix || "" : o.bankPix || "",
        tipoChavePix: useThirdParty
          ? o.thirdPartyPixKeyType || ""
          : o.bankPixType || "",
        valor: 0,
        descricao: "",
        entryIds: [],
      };
    }
    grouped[oid].valor += entry.value;
    grouped[oid].entryIds.push(entry.id);
  }

  const rows = Object.values(grouped).map((g) => ({
    ...g,
    valor: Math.round(g.valor * 100) / 100,
    descricao: `Repasse aluguel${month ? ` ${month}` : ""}`,
  }));

  if (format === "json") {
    return NextResponse.json(rows);
  }

  // CSV format
  const header =
    "Nome;Documento;Banco;Agencia;Conta;Chave PIX;Tipo PIX;Valor;Descricao";
  const csvRows = rows.map(
    (r) =>
      `${r.nome};${r.documento};${r.banco};${r.agencia};${r.conta};${r.chavePix};${r.tipoChavePix};${r.valor.toFixed(2).replace(".", ",")};${r.descricao}`
  );
  const csv = [header, ...csvRows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="remessa-pix${month ? `-${month}` : ""}.csv"`,
    },
  });
}
