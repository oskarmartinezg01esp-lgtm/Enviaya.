import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { confirmOrder } from "@/lib/services/orders";

/** Confirmación explícita desde la interfaz (botón "Confirmar pedido"). */
export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => confirmOrder((await apiUser()).id, (await params).id));
