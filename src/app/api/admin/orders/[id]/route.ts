import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { cancelOrder, setOrderStatus } from "@/lib/services/orders";

const schema = z.object({ status: z.enum(["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO", "ENTREGADO", "CANCELADO"]) });

export const PATCH = apiRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const admin = await apiAdmin();
  const { id } = await params;
  const { status } = schema.parse(await readJson(req));
  if (status === "CANCELADO") return cancelOrder(admin.id, id, { asAdmin: true });
  return setOrderStatus(id, status, { actorId: admin.id });
});
