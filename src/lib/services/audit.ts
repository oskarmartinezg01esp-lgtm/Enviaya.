import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function audit(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        data: params.data,
        ip: params.ip ?? null,
      },
    });
  } catch (err) {
    // La auditoría nunca debe romper el flujo principal.
    console.error("[audit] error", err);
  }
}
