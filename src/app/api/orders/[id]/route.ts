import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/services/orders";

export const GET = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => getOrder((await apiUser()).id, (await params).id));
