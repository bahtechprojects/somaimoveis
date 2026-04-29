import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export type AuditEntity =
  | "Contract"
  | "Owner"
  | "Tenant"
  | "Property"
  | "Payment"
  | "OwnerEntry"
  | "TenantEntry"
  | "User"
  | "Other";

interface LogAuditParams {
  userId?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityCode?: string | null;
  entityName?: string | null;
  /** Apenas para UPDATE: diff de campos. Pode ser objeto {field: {old, new}} */
  changes?: Record<string, unknown> | null;
  /** Metadata livre */
  metadata?: Record<string, unknown> | null;
  request?: NextRequest;
}

/**
 * Cria um registro de auditoria. Nao bloqueia em caso de erro
 * (auditoria nao deve impedir a operacao principal).
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const ipAddress = params.request?.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || params.request?.headers.get("x-real-ip")
      || null;
    const userAgent = params.request?.headers.get("user-agent")?.slice(0, 200) || null;

    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        entityCode: params.entityCode || null,
        entityName: params.entityName || null,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    // Nao bloqueia operacao principal por falha de log
    console.error("[AuditLog] Falha ao registrar:", err);
  }
}

/**
 * Calcula diff entre dois objetos (raso).
 * Retorna { campo: { old, new } } apenas para campos que mudaram.
 */
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    // Ignorar campos automaticos
    if (key === "id" || key === "createdAt" || key === "updatedAt" || key === "password") continue;
    const oldV = before[key];
    const newV = after[key];
    // Comparar como JSON para detectar mudanca em objetos/arrays
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      diff[key] = { old: oldV, new: newV };
    }
  }
  return diff;
}
