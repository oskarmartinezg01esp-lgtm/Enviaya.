import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { getOrderHistory } from "@/lib/services/orders";

export const GET = apiRoute(async () => getOrderHistory((await apiUser()).id, 50));
