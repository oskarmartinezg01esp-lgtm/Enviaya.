import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { repeatOrder } from "@/lib/services/orders";

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => repeatOrder((await apiUser()).id, (await params).id));
