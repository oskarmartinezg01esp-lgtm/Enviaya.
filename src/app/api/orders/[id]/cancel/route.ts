import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { cancelOrder } from "@/lib/services/orders";

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => cancelOrder((await apiUser()).id, (await params).id));
